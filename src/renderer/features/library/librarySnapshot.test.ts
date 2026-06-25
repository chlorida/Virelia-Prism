import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import { selectEffectiveLibraryCounts } from './librarySelectors';

const item = (kind: 'audio' | 'video', id: string): MediaItem => ({
  id,
  filePath: `D:/${id}`,
  fileName: id,
  folder: 'D:/',
  title: id,
  tags: [],
  kind,
  addedAt: '',
  favorite: false,
});

describe('library snapshot counts during scan', () => {
  it('keeps snapshot counts when media array is temporarily empty', () => {
    const counts = selectEffectiveLibraryCounts(
      {
        media: [],
        scanning: true,
        countsPending: true,
        snapshotCounts: { all: 27710, audio: 20176, video: 7534, favorites: 3, recent: 27 },
      },
      new Set(),
      {}
    );
    expect(counts.all).toBe(27710);
    expect(counts.pending).toBe(true);
    expect(counts.video).toBe(7534);
  });

  it('keeps snapshot counts during background scan when media is already warm', () => {
    const media = [item('video', 'v1'), item('audio', 'a1')];
    const counts = selectEffectiveLibraryCounts(
      {
        media,
        scanning: true,
        countsPending: false,
        snapshotCounts: { all: 99, audio: 1, video: 98, favorites: 0, recent: 0 },
      },
      new Set(),
      {}
    );
    expect(counts.all).toBe(99);
  });

  it('uses live counts after scan completes', () => {
    const media = [item('video', 'v1'), item('audio', 'a1')];
    const counts = selectEffectiveLibraryCounts(
      {
        media,
        scanning: false,
        countsPending: false,
        snapshotCounts: { all: 99, audio: 1, video: 98, favorites: 0, recent: 0 },
      },
      new Set(),
      {}
    );
    expect(counts.all).toBe(2);
  });
});
