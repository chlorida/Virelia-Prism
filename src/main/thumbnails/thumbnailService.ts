import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  THUMB_CACHE_VERSION,
  THUMB_FAILURE_COOLDOWN_MS,
  computeThumbnailCacheKey,
  isFailureMetaValid,
  isThumbnailMetaValid,
  type ThumbnailCacheMeta,
  type ThumbnailSizeVariant,
} from '../../shared/thumbnailCache';
import { addMediaAllowlistRoot } from '../mediaAllowlist';
import { isMediaPathAllowed } from '../mediaAllowlist';
import { toMediaProtocolUrl } from '../mediaProtocol';
import { getCachedFfmpegPath, locateFfmpeg } from './ffmpegLocator';

const execFileAsync = promisify(execFile);

export type ThumbnailStatus =
  | 'not-requested'
  | 'queued'
  | 'generating'
  | 'ready'
  | 'failed'
  | 'unsupported'
  | 'ffmpeg-missing'
  | 'path-not-allowed'
  | 'file-missing';

export interface ThumbnailRecord {
  status: ThumbnailStatus;
  thumbnailPath?: string;
  largeThumbnailPath?: string;
  url?: string;
  largeUrl?: string;
  error?: string;
  attemptedAt?: number;
  cacheKey?: string;
}

interface QueueJob {
  mediaId: string;
  filePath: string;
  fileName: string;
  cacheKey: string;
  priority: number;
}

const pendingCacheKeys = new Set<string>();
const queue: QueueJob[] = [];
const records = new Map<string, ThumbnailRecord>();
const cacheKeyToMediaIds = new Map<string, Set<string>>();
let activeJobs = 0;
const MAX_CONCURRENT = 2;

const VIDEO_EXT = /\.(mkv|mp4|webm|avi|mov|m4v|wmv|flv|ts|m2ts)$/i;
const MIN_BYTES = 800;

function thumbMainLog(message: string, detail?: Record<string, unknown>): void {
  if (process.env.VIRELIA_THUMB_DEBUG !== '1') return;
  if (detail) console.debug(`[Thumb] ${message}`, detail);
  else console.debug(`[Thumb] ${message}`);
}

function thumbCacheRoot(): string {
  const dir = path.join(app.getPath('userData'), 'thumb-cache');
  fs.mkdirSync(path.join(dir, 'small'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'large'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  addMediaAllowlistRoot(dir);
  // Legacy cache location — still allowlisted for old entries
  const legacy = path.join(app.getPath('userData'), 'thumbnails');
  if (fs.existsSync(legacy)) addMediaAllowlistRoot(legacy);
  return dir;
}

function variantPath(cacheKey: string, variant: ThumbnailSizeVariant): string {
  return path.join(thumbCacheRoot(), variant, `${cacheKey}.jpg`);
}

function metaPath(cacheKey: string): string {
  return path.join(thumbCacheRoot(), 'meta', `${cacheKey}.json`);
}

function readMeta(cacheKey: string): ThumbnailCacheMeta | undefined {
  try {
    const raw = fs.readFileSync(metaPath(cacheKey), 'utf8');
    return JSON.parse(raw) as ThumbnailCacheMeta;
  } catch {
    return undefined;
  }
}

function writeMeta(cacheKey: string, meta: ThumbnailCacheMeta): void {
  fs.writeFileSync(metaPath(cacheKey), JSON.stringify(meta, null, 0), 'utf8');
}

function statSource(filePath: string): { size: number; mtime: number } | undefined {
  try {
    const stat = fs.statSync(filePath);
    return { size: stat.size, mtime: stat.mtimeMs };
  } catch {
    return undefined;
  }
}

function resolveCacheKey(filePath: string): { cacheKey: string; size: number; mtime: number } {
  const stat = statSource(filePath);
  const size = stat?.size ?? 0;
  const mtime = stat?.mtime ?? 0;
  return { cacheKey: computeThumbnailCacheKey(filePath, size, mtime), size, mtime };
}

function isValidImage(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > MIN_BYTES;
  } catch {
    return false;
  }
}

function findLegacyCachedImage(mediaId: string, cacheKey: string): string | undefined {
  const legacyDir = path.join(app.getPath('userData'), 'thumbnails');
  const legacyPath = path.join(legacyDir, `${mediaId}-${cacheKey}.jpg`);
  return isValidImage(legacyPath) ? legacyPath : undefined;
}

function resolveReadyFromDisk(
  mediaId: string,
  filePath: string,
  cacheKey: string,
  size: number,
  mtime: number
): ThumbnailRecord | undefined {
  const meta = readMeta(cacheKey);
  const stat = { path: filePath, size, mtime };

  if (meta && isFailureMetaValid(meta)) {
    thumbMainLog('cache hit failure marker', { cacheKey, reason: meta.reason });
    return {
      status: 'failed',
      error: meta.reason ?? 'Thumbnail generation failed',
      cacheKey,
      attemptedAt: meta.attemptedAt,
    };
  }

  if (meta && isThumbnailMetaValid(meta, stat)) {
    const small = meta.smallPath && isValidImage(meta.smallPath) ? meta.smallPath : undefined;
    const large = meta.largePath && isValidImage(meta.largePath) ? meta.largePath : undefined;
    if (small || large) {
      thumbMainLog('cache hit meta', { cacheKey });
      return {
        status: 'ready',
        thumbnailPath: small ?? large,
        largeThumbnailPath: large ?? small,
        url: toMediaProtocolUrl(small ?? large!),
        largeUrl: toMediaProtocolUrl(large ?? small!),
        cacheKey,
      };
    }
  }

  const smallPath = variantPath(cacheKey, 'small');
  const largePath = variantPath(cacheKey, 'large');
  if (isValidImage(smallPath) || isValidImage(largePath)) {
    thumbMainLog('cache hit disk', { cacheKey });
    const readyMeta: ThumbnailCacheMeta = {
      version: THUMB_CACHE_VERSION,
      cacheKey,
      sourcePath: filePath,
      sourceSize: size,
      sourceMtime: mtime,
      generatedAt: Date.now(),
      smallPath: isValidImage(smallPath) ? smallPath : undefined,
      largePath: isValidImage(largePath) ? largePath : undefined,
    };
    writeMeta(cacheKey, readyMeta);
    return {
      status: 'ready',
      thumbnailPath: readyMeta.smallPath ?? readyMeta.largePath,
      largeThumbnailPath: readyMeta.largePath ?? readyMeta.smallPath,
      url: toMediaProtocolUrl(readyMeta.smallPath ?? readyMeta.largePath!),
      largeUrl: toMediaProtocolUrl(readyMeta.largePath ?? readyMeta.smallPath!),
      cacheKey,
    };
  }

  const legacy = findLegacyCachedImage(mediaId, cacheKey);
  if (legacy) {
    thumbMainLog('cache hit legacy', { cacheKey, mediaId });
    return {
      status: 'ready',
      thumbnailPath: legacy,
      largeThumbnailPath: legacy,
      url: toMediaProtocolUrl(legacy),
      largeUrl: toMediaProtocolUrl(legacy),
      cacheKey,
    };
  }

  return undefined;
}

function linkMediaToCacheKey(mediaId: string, cacheKey: string): void {
  const set = cacheKeyToMediaIds.get(cacheKey) ?? new Set<string>();
  set.add(mediaId);
  cacheKeyToMediaIds.set(cacheKey, set);
}

function propagateRecord(cacheKey: string, record: ThumbnailRecord): void {
  const ids = cacheKeyToMediaIds.get(cacheKey);
  if (!ids) return;
  for (const id of ids) {
    records.set(id, record);
  }
}

export async function detectFfmpeg(): Promise<{ available: boolean; path?: string }> {
  const result = await locateFfmpeg();
  return { available: result.available, path: result.path };
}

function setRecord(mediaId: string, patch: ThumbnailRecord): ThumbnailRecord {
  const next = { ...records.get(mediaId), ...patch };
  records.set(mediaId, next);
  if (next.cacheKey) propagateRecord(next.cacheKey, next);
  return next;
}

export function getThumbnailRecord(mediaId: string): ThumbnailRecord {
  return records.get(mediaId) ?? { status: 'not-requested' };
}

export function isVideoThumbnailCandidate(filePath: string, fileName: string): boolean {
  if (!VIDEO_EXT.test(fileName)) return false;
  if (!fs.existsSync(filePath)) return false;
  return isMediaPathAllowed(filePath);
}

export function getThumbnailStatus(mediaId: string, filePath: string, fileName: string): ThumbnailRecord {
  const existing = records.get(mediaId);
  if (existing?.status === 'ready' && existing.url) return existing;

  if (!VIDEO_EXT.test(fileName)) {
    return setRecord(mediaId, { status: 'unsupported', error: 'Not a video file' });
  }

  if (!fs.existsSync(filePath)) {
    return setRecord(mediaId, { status: 'file-missing', error: 'File not found on disk' });
  }

  if (!isMediaPathAllowed(filePath)) {
    thumbMainLog('failed reason=path-not-allowed', { mediaId, filePath });
    return setRecord(mediaId, { status: 'path-not-allowed', error: 'Path not in media allowlist' });
  }

  const { cacheKey, size, mtime } = resolveCacheKey(filePath);
  linkMediaToCacheKey(mediaId, cacheKey);

  const ready = resolveReadyFromDisk(mediaId, filePath, cacheKey, size, mtime);
  if (ready) return setRecord(mediaId, ready);

  thumbMainLog('cache miss', { cacheKey, mediaId });
  return existing ?? setRecord(mediaId, { status: 'not-requested', cacheKey });
}

async function extractFrame(
  filePath: string,
  outPath: string,
  timestamp: string,
  width: number
): Promise<boolean> {
  const binary = getCachedFfmpegPath() ?? 'ffmpeg';
  try {
    await execFileAsync(
      binary,
      [
        '-hide_banner', '-loglevel', 'error',
        '-ss', timestamp,
        '-i', filePath,
        '-frames:v', '1',
        '-vf', `scale=${width}:-1`,
        '-q:v', width >= 640 ? '4' : '5',
        '-y', outPath,
      ],
      { timeout: 25000 }
    );
    return isValidImage(outPath);
  } catch {
    return false;
  }
}

async function generateVariants(filePath: string, cacheKey: string): Promise<{ small?: string; large?: string }> {
  const smallOut = variantPath(cacheKey, 'small');
  const largeOut = variantPath(cacheKey, 'large');
  const attempts = ['00:01:00', '00:00:12', '00:02:30', '00:00:35'];

  let small: string | undefined;
  let large: string | undefined;

  for (const ts of attempts) {
    if (!small && await extractFrame(filePath, smallOut, ts, 320)) {
      small = smallOut;
    }
    if (!large && await extractFrame(filePath, largeOut, ts, 640)) {
      large = largeOut;
    }
    if (small && large) break;
  }

  if (!small && large) {
    try {
      fs.copyFileSync(large, smallOut);
      if (isValidImage(smallOut)) small = smallOut;
    } catch { /* ignore */ }
  }

  return { small, large };
}

function markFailure(cacheKey: string, filePath: string, size: number, mtime: number, reason: string): void {
  const attemptedAt = Date.now();
  writeMeta(cacheKey, {
    version: THUMB_CACHE_VERSION,
    cacheKey,
    sourcePath: filePath,
    sourceSize: size,
    sourceMtime: mtime,
    generatedAt: attemptedAt,
    failed: true,
    reason,
    attemptedAt,
    retryAfter: attemptedAt + THUMB_FAILURE_COOLDOWN_MS,
  });
}

async function processJob(job: QueueJob): Promise<void> {
  const { mediaId, filePath, cacheKey } = job;
  const stat = statSource(filePath);
  const size = stat?.size ?? 0;
  const mtime = stat?.mtime ?? 0;

  setRecord(mediaId, { status: 'generating', cacheKey, attemptedAt: Date.now() });

  if (!fs.existsSync(filePath)) {
    setRecord(mediaId, { status: 'file-missing', error: 'File not found', cacheKey });
    return;
  }

  if (!isMediaPathAllowed(filePath)) {
    setRecord(mediaId, { status: 'path-not-allowed', error: 'Path not allowed', cacheKey });
    return;
  }

  const cached = resolveReadyFromDisk(mediaId, filePath, cacheKey, size, mtime);
  if (cached?.status === 'ready') {
    setRecord(mediaId, cached);
    return;
  }

  thumbMainLog('generation started', { cacheKey, mediaId });
  const variants = await generateVariants(filePath, cacheKey);

  if (variants.small || variants.large) {
    writeMeta(cacheKey, {
      version: THUMB_CACHE_VERSION,
      cacheKey,
      sourcePath: filePath,
      sourceSize: size,
      sourceMtime: mtime,
      generatedAt: Date.now(),
      smallPath: variants.small,
      largePath: variants.large,
    });
    thumbMainLog('generation completed', { cacheKey });
    setRecord(mediaId, {
      status: 'ready',
      thumbnailPath: variants.small ?? variants.large,
      largeThumbnailPath: variants.large ?? variants.small,
      url: toMediaProtocolUrl(variants.small ?? variants.large!),
      largeUrl: toMediaProtocolUrl(variants.large ?? variants.small!),
      cacheKey,
    });
    return;
  }

  markFailure(cacheKey, filePath, size, mtime, 'Frame extraction failed');
  thumbMainLog('generation failed', { cacheKey, mediaId });
  setRecord(mediaId, {
    status: 'failed',
    error: 'Frame extraction failed',
    cacheKey,
    attemptedAt: Date.now(),
  });
}

async function pumpQueue(): Promise<void> {
  const ffmpeg = await locateFfmpeg();
  if (!ffmpeg.available) {
    thumbMainLog('extractor missing', { searched: ffmpeg.searched });
    while (queue.length > 0) {
      const job = queue.shift()!;
      pendingCacheKeys.delete(job.cacheKey);
      setRecord(job.mediaId, {
        status: 'ffmpeg-missing',
        error: 'Thumbnail engine not found',
        attemptedAt: Date.now(),
        cacheKey: job.cacheKey,
      });
    }
    return;
  }

  while (queue.length > 0 && activeJobs < MAX_CONCURRENT) {
    queue.sort((a, b) => b.priority - a.priority);
    const job = queue.shift();
    if (!job) break;
    pendingCacheKeys.delete(job.cacheKey);
    activeJobs += 1;
    void processJob(job).finally(() => {
      activeJobs -= 1;
      void pumpQueue();
    });
  }
}

export function requestThumbnailGeneration(
  mediaId: string,
  filePath: string,
  fileName: string,
  priority = 0
): ThumbnailRecord {
  const status = getThumbnailStatus(mediaId, filePath, fileName);
  if (status.status === 'ready' || status.status === 'failed') return status;

  if (!isVideoThumbnailCandidate(filePath, fileName)) {
    return status;
  }

  const cacheKey = status.cacheKey ?? resolveCacheKey(filePath).cacheKey;
  if (pendingCacheKeys.has(cacheKey)) {
    thumbMainLog('deduplicated request', { cacheKey, mediaId });
    return getThumbnailRecord(mediaId);
  }

  pendingCacheKeys.add(cacheKey);
  queue.push({ mediaId, filePath, fileName, cacheKey, priority });
  setRecord(mediaId, { status: 'queued', cacheKey: status.cacheKey, attemptedAt: Date.now() });
  thumbMainLog('queued', { mediaId, cacheKey, priority });
  void pumpQueue();

  return getThumbnailRecord(mediaId);
}

export function retryThumbnail(mediaId: string, filePath: string, fileName: string): ThumbnailRecord {
  const { cacheKey } = resolveCacheKey(filePath);
  try {
    fs.unlinkSync(metaPath(cacheKey));
  } catch { /* ignore */ }
  for (const variant of ['small', 'large'] as const) {
    try {
      fs.unlinkSync(variantPath(cacheKey, variant));
    } catch { /* ignore */ }
  }
  records.delete(mediaId);
  pendingCacheKeys.delete(cacheKey);
  return requestThumbnailGeneration(mediaId, filePath, fileName, 100);
}

/** @deprecated */
export function getThumbnailUrl(mediaId: string, filePath: string): string | undefined {
  return getThumbnailStatus(mediaId, filePath, path.basename(filePath)).url;
}
