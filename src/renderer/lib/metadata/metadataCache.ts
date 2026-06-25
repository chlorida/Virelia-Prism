interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export const METADATA_CACHE_TTL = {
  titleDetails: 7 * 24 * 60 * 60 * 1000,
  searchResults: 30 * 60 * 1000,
  searchEmptyResults: 90 * 1000,
  discoverRails: 60 * 60 * 1000,
  watchOptions: 12 * 60 * 60 * 1000,
  images: 7 * 24 * 60 * 60 * 1000,
} as const;

export function metadataCacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function metadataCacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function metadataCacheClear(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
