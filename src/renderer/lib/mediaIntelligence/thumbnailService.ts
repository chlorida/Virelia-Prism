import type { MediaItem } from '../../../shared/types';
import type { ThumbnailApiRecord, ThumbnailApiStatus } from '../../../shared/prismApi.types';
import {
  THUMB_FAILURE_COOLDOWN_MS,
  computeThumbnailCacheKey,
} from '../../../shared/thumbnailCache';
import { isPlayableLocalMediaItem } from './playableMediaFilter';
import { captureVideoFrameDataUrl } from './thumbnailFrameCapture';
import { thumbLog } from './thumbDebug';
import {
  perfMarkFirstThumbnailReady,
  perfMarkThumbnailQueueStart,
} from '../perfReport';

export type { ThumbnailApiStatus };

export type ThumbnailPriority = 'critical' | 'high' | 'normal' | 'low' | 'idle';

const PRIORITY_SCORE: Record<ThumbnailPriority, number> = {
  critical: 100,
  high: 75,
  normal: 50,
  low: 25,
  idle: 5,
};

const cache = new Map<string, ThumbnailApiRecord>();
const cacheKeyIndex = new Map<string, string>();
const listeners = new Set<(mediaId: string) => void>();
const pollTimers = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Map<string, Promise<ThumbnailApiRecord>>();
const canvasFallbackAttempted = new Set<string>();
const failureCooldownUntil = new Map<string, number>();
let firstThumbnailMarked = false;

const TERMINAL: ThumbnailApiStatus[] = [
  'ready',
  'failed',
  'ffmpeg-missing',
  'unsupported',
  'file-missing',
  'path-not-allowed',
];

function notify(mediaId: string): void {
  const record = cache.get(mediaId);
  if (!firstThumbnailMarked && record?.status === 'ready' && record.url) {
    firstThumbnailMarked = true;
    perfMarkThumbnailQueueStart();
    perfMarkFirstThumbnailReady();
  }
  for (const fn of listeners) fn(mediaId);
}

function isTerminal(status?: ThumbnailApiStatus): boolean {
  return Boolean(status && TERMINAL.includes(status));
}

export function subscribeThumbnails(handler: (mediaId: string) => void): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function getThumbnailState(mediaId: string): ThumbnailApiRecord | undefined {
  return cache.get(mediaId);
}

export function resolveItemCacheKey(item: MediaItem): string {
  const size = item.size ?? 0;
  const mtime = item.mtimeMs ?? 0;
  return computeThumbnailCacheKey(item.filePath, size, mtime);
}

function canQueueThumbnail(item: MediaItem): boolean {
  return item.kind === 'video' && isPlayableLocalMediaItem(item);
}

function clearPoll(mediaId: string): void {
  const timer = pollTimers.get(mediaId);
  if (timer) clearTimeout(timer);
  pollTimers.delete(mediaId);
}

function isInFailureCooldown(cacheKey: string): boolean {
  const until = failureCooldownUntil.get(cacheKey);
  return until != null && Date.now() < until;
}

function rememberFailure(record: ThumbnailApiRecord, cacheKey: string): void {
  if (record.status !== 'failed') return;
  const until = record.attemptedAt
    ? record.attemptedAt + THUMB_FAILURE_COOLDOWN_MS
    : Date.now() + THUMB_FAILURE_COOLDOWN_MS;
  failureCooldownUntil.set(cacheKey, until);
}

function storeRecord(item: MediaItem, record: ThumbnailApiRecord): void {
  cache.set(item.id, record);
  if (record.cacheKey) {
    cacheKeyIndex.set(record.cacheKey, item.id);
  } else {
    const key = resolveItemCacheKey(item);
    cacheKeyIndex.set(key, item.id);
    record = { ...record, cacheKey: key };
    cache.set(item.id, record);
  }
}

function schedulePoll(item: MediaItem, attempt = 0): void {
  clearPoll(item.id);
  if (attempt > 24) {
    const state: ThumbnailApiRecord = {
      status: 'failed',
      error: 'Thumbnail generation timed out',
      attemptedAt: Date.now(),
      cacheKey: resolveItemCacheKey(item),
    };
    storeRecord(item, state);
    rememberFailure(state, state.cacheKey!);
    notify(item.id);
    return;
  }

  const timer = globalThis.setTimeout(() => {
    void pollThumbnail(item, attempt + 1);
  }, attempt < 2 ? 1200 : 2500);
  pollTimers.set(item.id, timer);
}

async function pollThumbnail(item: MediaItem, attempt: number): Promise<void> {
  const api = window.prism?.thumbnails;
  if (!api || !canQueueThumbnail(item)) return;

  const cacheKey = resolveItemCacheKey(item);
  if (isInFailureCooldown(cacheKey)) {
    thumbLog('poll skipped cooldown', { mediaId: item.id, cacheKey });
    return;
  }

  try {
    const result = await api.get(item.id, item.filePath, item.fileName);
    storeRecord(item, result);
    notify(item.id);
    thumbLog('poll', { mediaId: item.id, status: result.status, attempt });
    if (!isTerminal(result.status)) {
      schedulePoll(item, attempt);
    } else {
      clearPoll(item.id);
      if (result.status === 'failed') rememberFailure(result, cacheKey);
      if (result.status === 'ffmpeg-missing') void tryCanvasFallback(item);
    }
  } catch (error) {
    const state: ThumbnailApiRecord = {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Thumbnail poll failed',
      attemptedAt: Date.now(),
      cacheKey,
    };
    storeRecord(item, state);
    rememberFailure(state, cacheKey);
    notify(item.id);
    clearPoll(item.id);
  }
}

async function tryCanvasFallback(item: MediaItem): Promise<void> {
  if (canvasFallbackAttempted.has(item.id)) return;
  canvasFallbackAttempted.add(item.id);
  const dataUrl = await captureVideoFrameDataUrl(item);
  if (!dataUrl) return;
  storeRecord(item, { status: 'ready', url: dataUrl, largeUrl: dataUrl, cacheKey: resolveItemCacheKey(item) });
  notify(item.id);
}

async function fetchThumbnail(
  item: MediaItem,
  priority: ThumbnailPriority
): Promise<ThumbnailApiRecord> {
  const cacheKey = resolveItemCacheKey(item);

  if (isInFailureCooldown(cacheKey)) {
    thumbLog('request skipped cooldown', { mediaId: item.id, cacheKey });
    return cache.get(item.id) ?? {
      status: 'failed',
      error: 'Thumbnail unavailable',
      cacheKey,
      attemptedAt: Date.now(),
    };
  }

  const existing = cache.get(item.id);
  if (existing?.status === 'ready' && existing.url) {
    thumbLog('memory cache hit', { mediaId: item.id, cacheKey });
    return existing;
  }

  const inflight = inFlight.get(cacheKey);
  if (inflight) {
    thumbLog('deduplicated request', { mediaId: item.id, cacheKey });
    return inflight;
  }

  const api = typeof window !== 'undefined' ? window.prism?.thumbnails : undefined;
  if (!api) {
    const state: ThumbnailApiRecord = { status: 'failed', error: 'Thumbnail API unavailable', cacheKey };
    storeRecord(item, state);
    return state;
  }

  thumbLog('cache miss request', { mediaId: item.id, cacheKey, priority });
  perfMarkThumbnailQueueStart();

  const promise = api
    .get(item.id, item.filePath, item.fileName, { priority: PRIORITY_SCORE[priority] })
    .then((result) => {
      storeRecord(item, result);
      notify(item.id);
      if (!isTerminal(result.status)) {
        schedulePoll(item, 0);
      } else if (result.status === 'failed') {
        rememberFailure(result, cacheKey);
      } else if (result.status === 'ffmpeg-missing') {
        void tryCanvasFallback(item);
      }
      return result;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, promise);
  return promise;
}

export async function ensureThumbnail(
  item: MediaItem,
  priority: ThumbnailPriority = 'normal'
): Promise<ThumbnailApiRecord> {
  if (!canQueueThumbnail(item)) {
    const state: ThumbnailApiRecord = { status: 'unsupported', error: 'Not a playable local video' };
    storeRecord(item, state);
    return state;
  }

  if (item.albumArtPath) {
    const state: ThumbnailApiRecord = {
      status: 'ready',
      url: item.albumArtPath,
      largeUrl: item.albumArtPath,
      cacheKey: resolveItemCacheKey(item),
    };
    storeRecord(item, state);
    return state;
  }

  return fetchThumbnail(item, priority);
}

export async function retryThumbnailForItem(item: MediaItem): Promise<ThumbnailApiRecord> {
  const api = window.prism?.thumbnails;
  if (!api || !canQueueThumbnail(item)) {
    return { status: 'unsupported' };
  }
  const cacheKey = resolveItemCacheKey(item);
  clearPoll(item.id);
  canvasFallbackAttempted.delete(item.id);
  failureCooldownUntil.delete(cacheKey);
  inFlight.delete(cacheKey);
  const result = await api.retry(item.id, item.filePath, item.fileName);
  storeRecord(item, result);
  notify(item.id);
  if (!isTerminal(result.status)) {
    schedulePoll(item, 0);
  } else if (result.status === 'ffmpeg-missing') {
    void tryCanvasFallback(item);
  }
  return result;
}

export async function detectFfmpegInEnvironment(): Promise<{ available: boolean; path?: string }> {
  const api = window.prism?.thumbnails;
  if (!api) return { available: false };
  return api.detectFfmpeg();
}

export function resolveThumbUrl(item: MediaItem, variant: 'small' | 'large' = 'small'): string | undefined {
  const cached = cache.get(item.id);
  if (variant === 'large') return cached?.largeUrl ?? cached?.url;
  return cached?.url ?? item.albumArtPath;
}

export function isThumbnailLoading(item: MediaItem): boolean {
  const s = cache.get(item.id)?.status;
  return s === 'queued' || s === 'generating';
}

export { PRIORITY_SCORE };
