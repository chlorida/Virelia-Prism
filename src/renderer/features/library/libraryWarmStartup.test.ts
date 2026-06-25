import { describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import { libraryStore } from './libraryStore';
import { selectEffectiveLibraryCounts } from './librarySelectors';
import { indexMediaLibraryQuick } from '../../lib/mediaIndex';
import { scheduleBackgroundSearchIndex } from '../../lib/mediaIndex';

function item(id: string, kind: 'audio' | 'video' = 'video'): MediaItem {
  return {
    id,
    filePath: `D:/Media/${id}.mkv`,
    fileName: `${id}.mkv`,
    folder: 'D:/Media',
    title: id,
    tags: [],
    kind,
    addedAt: '',
    favorite: false,
  };
}

describe('warm startup behavior', () => {
  it('snapshot counts stay when media array is empty during scan', () => {
    libraryStore.patch({
      media: [],
      scanning: true,
      snapshotCounts: { all: 100, audio: 40, video: 60, favorites: 0, recent: 0 },
    });
    const counts = selectEffectiveLibraryCounts(
      libraryStore.getState(),
      new Set(),
      {}
    );
    expect(counts.all).toBe(100);
    expect(counts.video).toBe(60);
  });

  it('quick index does not build full searchText synchronously', () => {
    const items = Array.from({ length: 500 }, (_, i) => item(`id-${i}`));
    const indexed = indexMediaLibraryQuick(items);
    expect(indexed.length).toBe(500);
    expect(indexed[0]?.searchText).toBeUndefined();
    expect(indexed[0]?.folderLabel).toBeTruthy();
  });

  it('background search index schedules without blocking', () => {
    const items = Array.from({ length: 100 }, (_, i) => item(`s-${i}`));
    const idle = vi.fn((cb: IdleRequestCallback) => {
      cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
      return 1;
    });
    vi.stubGlobal('requestIdleCallback', idle);
    scheduleBackgroundSearchIndex(items);
    expect(idle).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
