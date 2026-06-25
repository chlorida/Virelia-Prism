import type { MediaItem } from '../../../shared/types';

/** Skip background disk rescan when snapshot is newer than this interval. */
export const RESCAN_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Fraction of items that must have searchText before skipping warm (0–1). */
export const SEARCH_INDEX_COVERAGE_THRESHOLD = 0.95;

const SEARCH_INDEX_SAMPLE_SIZE = 200;

export function shouldScheduleBackgroundRescan(options: {
  usedCache: boolean;
  scannedAt?: string;
  force?: boolean;
}): boolean {
  if (options.force) return true;
  if (!options.usedCache) return true;
  if (!options.scannedAt) return true;
  const scannedMs = Date.parse(options.scannedAt);
  if (!Number.isFinite(scannedMs)) return true;
  const age = Date.now() - scannedMs;
  return age >= RESCAN_MIN_INTERVAL_MS;
}

export function measureSearchIndexCoverage(items: MediaItem[]): number {
  if (items.length === 0) return 1;
  const step = Math.max(1, Math.floor(items.length / SEARCH_INDEX_SAMPLE_SIZE));
  let sampled = 0;
  let withIndex = 0;
  for (let i = 0; i < items.length; i += step) {
    sampled += 1;
    const text = items[i]?.searchText;
    if (text && text.trim().length > 0) withIndex += 1;
  }
  return sampled === 0 ? 0 : withIndex / sampled;
}

export function isSearchIndexWarmNeeded(items: MediaItem[]): boolean {
  return measureSearchIndexCoverage(items) < SEARCH_INDEX_COVERAGE_THRESHOLD;
}
