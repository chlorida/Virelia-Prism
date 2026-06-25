import { describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import { libraryStore } from './libraryStore';
import { selectEffectiveLibraryCounts } from './librarySelectors';
import { isLibraryBlockingLoad } from './libraryBootState';

function item(id: string): MediaItem {
  return {
    id,
    filePath: `D:/x/${id}.mkv`,
    fileName: `${id}.mkv`,
    folder: 'D:/x',
    title: id,
    tags: [],
    kind: 'video',
    addedAt: '',
    favorite: false,
  };
}

describe('library boot pipeline invariants', () => {
  it('snapshot counts stay during scan', () => {
    libraryStore.patch({
      media: [],
      scanning: true,
      countsPending: true,
      snapshotCounts: { all: 500, audio: 100, video: 400, favorites: 2, recent: 10 },
    });
    const counts = selectEffectiveLibraryCounts(
      libraryStore.getState(),
      new Set(),
      {}
    );
    expect(counts.all).toBe(500);
    expect(counts.pending).toBe(true);
  });

  it('scanning with media is not blocking load', () => {
    libraryStore.patch({
      media: [item('a')],
      boot: 'readyAndScanning',
      scanning: true,
    });
    expect(isLibraryBlockingLoad('readyAndScanning', true)).toBe(false);
  });

  it('background search index does not gate ready', async () => {
    const { scheduleBackgroundSearchIndex } = await import('../../lib/mediaIndex');
    const idle = vi.fn((cb: IdleRequestCallback) => {
      cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
      return 1;
    });
    vi.stubGlobal('requestIdleCallback', idle);
    scheduleBackgroundSearchIndex([item('a'), item('b')]);
    expect(idle).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
