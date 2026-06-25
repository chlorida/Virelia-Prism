import type { MediaItem } from '../../shared/types';
import { mergeDurationCache } from './durationCache';

const PROBE_TIMEOUT_MS = 3500;
const FLUSH_INTERVAL_MS = 600;
const DEFAULT_MAX_ITEMS = 40;
const DEFAULT_CONCURRENCY = 1;

export function probeMediaDuration(filePath: string, kind: 'audio' | 'video' = 'audio'): Promise<number | undefined> {
  return new Promise((resolve) => {
    const element = document.createElement(kind === 'video' ? 'video' : 'audio');
    element.preload = 'metadata';
    let settled = false;

    const finish = (duration?: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      element.removeAttribute('src');
      element.load();
      resolve(duration);
    };

    const timer = window.setTimeout(() => finish(undefined), PROBE_TIMEOUT_MS);

    element.addEventListener('loadedmetadata', () => {
      finish(Number.isFinite(element.duration) ? Math.floor(element.duration) : undefined);
    }, { once: true });

    element.addEventListener('error', () => finish(undefined), { once: true });

    void window.prism.mediaUrl(filePath).then((url) => {
      element.src = url;
      element.load();
    }).catch(() => finish(undefined));
  });
}

export interface EnrichOptions {
  knownDurations?: Record<string, number>;
  maxItems?: number;
  concurrency?: number;
}

/** Fills durations for a capped subset without flooding React updates. */
export function enrichMediaItemsInBackground(
  items: MediaItem[],
  onBatchEnriched: (updates: Record<string, number>) => void,
  signal?: AbortSignal,
  options?: EnrichOptions
): Promise<void> {
  const known = options?.knownDurations ?? {};
  const maxItems = options?.maxItems ?? DEFAULT_MAX_ITEMS;
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;

  const queue = items
    .filter((item) => item.filePath && !item.durationSeconds && !known[item.id])
    .slice(0, maxItems);

  if (queue.length === 0) return Promise.resolve();

  const pending: Record<string, number> = {};
  let flushTimer: number | undefined;

  const flush = () => {
    flushTimer = undefined;
    if (Object.keys(pending).length === 0) return;
    const batch = { ...pending };
    for (const key of Object.keys(pending)) delete pending[key];
    mergeDurationCache(batch);
    onBatchEnriched(batch);
  };

  const scheduleFlush = () => {
    if (flushTimer !== undefined) return;
    flushTimer = window.setTimeout(flush, FLUSH_INTERVAL_MS);
  };

  async function worker() {
    while (queue.length > 0) {
      if (signal?.aborted) {
        if (flushTimer !== undefined) window.clearTimeout(flushTimer);
        return;
      }
      const item = queue.shift();
      if (!item?.filePath) continue;
      const durationSeconds = await probeMediaDuration(item.filePath, item.kind);
      if (signal?.aborted || !durationSeconds) continue;
      pending[item.id] = durationSeconds;
      scheduleFlush();
    }
  }

  const workers = Math.min(concurrency, queue.length);
  return Promise.all(Array.from({ length: workers }, () => worker())).then(() => {
    if (flushTimer !== undefined) window.clearTimeout(flushTimer);
    flush();
  });
}

export function pruneQueueToMedia<T extends { mediaId: string }>(queue: T[], media: MediaItem[]): T[] {
  const ids = new Set(media.map((item) => item.id));
  return queue.filter((entry) => ids.has(entry.mediaId));
}
