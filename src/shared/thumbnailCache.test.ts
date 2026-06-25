import { describe, expect, it } from 'vitest';
import {
  THUMB_CACHE_VERSION,
  computeThumbnailCacheKey,
  isFailureMetaValid,
  isThumbnailMetaValid,
  type ThumbnailCacheMeta,
} from './thumbnailCache';

describe('thumbnail cache key', () => {
  it('is stable for the same source identity', () => {
    const a = computeThumbnailCacheKey('D:/Anime/ep01.mkv', 1024, 1000);
    const b = computeThumbnailCacheKey('D:/Anime/ep01.mkv', 1024, 1000);
    expect(a).toBe(b);
  });

  it('changes when file size or mtime changes', () => {
    const base = computeThumbnailCacheKey('D:/Anime/ep01.mkv', 1024, 1000);
    const sizeChanged = computeThumbnailCacheKey('D:/Anime/ep01.mkv', 2048, 1000);
    const mtimeChanged = computeThumbnailCacheKey('D:/Anime/ep01.mkv', 1024, 2000);
    expect(sizeChanged).not.toBe(base);
    expect(mtimeChanged).not.toBe(base);
  });

  it('does not depend on media id', () => {
    const a = computeThumbnailCacheKey('D:/Anime/ep01.mkv', 100, 200);
    const b = computeThumbnailCacheKey('D:/Anime/ep01.mkv', 100, 200);
    expect(a).toBe(b);
  });
});

describe('thumbnail cache metadata', () => {
  const stat = { path: 'D:/Anime/ep01.mkv', size: 100, mtime: 200 };

  it('validates matching metadata', () => {
    const meta: ThumbnailCacheMeta = {
      version: THUMB_CACHE_VERSION,
      cacheKey: 'abc',
      sourcePath: stat.path,
      sourceSize: stat.size,
      sourceMtime: stat.mtime,
      generatedAt: Date.now(),
      smallPath: '/cache/small/abc.jpg',
    };
    expect(isThumbnailMetaValid(meta, stat)).toBe(true);
  });

  it('rejects stale metadata after source change', () => {
    const meta: ThumbnailCacheMeta = {
      version: THUMB_CACHE_VERSION,
      cacheKey: 'abc',
      sourcePath: stat.path,
      sourceSize: stat.size,
      sourceMtime: stat.mtime,
      generatedAt: Date.now(),
    };
    expect(isThumbnailMetaValid(meta, { ...stat, size: 999 })).toBe(false);
  });

  it('respects failure cooldown marker', () => {
    const meta: ThumbnailCacheMeta = {
      version: THUMB_CACHE_VERSION,
      cacheKey: 'abc',
      sourcePath: stat.path,
      sourceSize: stat.size,
      sourceMtime: stat.mtime,
      generatedAt: Date.now(),
      failed: true,
      attemptedAt: Date.now(),
      retryAfter: Date.now() + 60_000,
    };
    expect(isFailureMetaValid(meta)).toBe(true);
  });
});
