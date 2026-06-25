import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import {
  isSearchIndexWarmNeeded,
  measureSearchIndexCoverage,
  RESCAN_MIN_INTERVAL_MS,
  shouldScheduleBackgroundRescan,
} from './libraryCachePolicy';

function item(id: string, searchText?: string): MediaItem {
  return {
    id,
    filePath: `D:/Media/${id}.mkv`,
    fileName: `${id}.mkv`,
    folder: 'D:/Media',
    title: id,
    tags: [],
    kind: 'video',
    addedAt: '',
    favorite: false,
    searchText,
  };
}

describe('libraryCachePolicy', () => {
  it('skips rescan for fresh snapshot', () => {
    const scannedAt = new Date(Date.now() - RESCAN_MIN_INTERVAL_MS + 60_000).toISOString();
    expect(
      shouldScheduleBackgroundRescan({ usedCache: true, scannedAt })
    ).toBe(false);
  });

  it('runs rescan when snapshot is stale', () => {
    const scannedAt = new Date(Date.now() - RESCAN_MIN_INTERVAL_MS - 60_000).toISOString();
    expect(
      shouldScheduleBackgroundRescan({ usedCache: true, scannedAt })
    ).toBe(true);
  });

  it('forces rescan when requested', () => {
    const scannedAt = new Date().toISOString();
    expect(
      shouldScheduleBackgroundRescan({ usedCache: true, scannedAt, force: true })
    ).toBe(true);
  });

  it('detects full search index coverage', () => {
    const items = Array.from({ length: 100 }, (_, i) => item(`id-${i}`, `blob-${i}`));
    expect(measureSearchIndexCoverage(items)).toBe(1);
    expect(isSearchIndexWarmNeeded(items)).toBe(false);
  });

  it('needs warm when searchText is missing', () => {
    const items = Array.from({ length: 100 }, (_, i) => item(`id-${i}`));
    expect(isSearchIndexWarmNeeded(items)).toBe(true);
  });
});
