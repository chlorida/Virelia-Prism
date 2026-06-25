import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import {
  selectFilteredMedia,
  selectLibraryCounts,
  selectListSource,
  selectVisibleMedia
} from './librarySelectors';
import { initialLibraryState } from './libraryTypes';

function item(id: string, kind: 'audio' | 'video' = 'audio', title = id): MediaItem {
  return {
    id,
    title,
    filePath: `C:\\media\\${id}.mp3`,
    kind,
    folder: 'media',
    addedAt: '2020-01-01T00:00:00.000Z'
  } as MediaItem;
}

describe('librarySelectors', () => {
  const media = [item('a', 'audio'), item('b', 'video')];
  const state = {
    ...initialLibraryState,
    media,
    audioMedia: [media[0]],
    videoMedia: [media[1]]
  };

  it('selects audio list source when filter is audio', () => {
    const source = selectListSource(
      { ...state, filter: 'audio' },
      { debouncedQuery: '', activePlaylistId: null },
      undefined
    );
    expect(source).toHaveLength(1);
    expect(source[0]?.kind).toBe('audio');
  });

  it('computes counts with favorites size', () => {
    const counts = selectLibraryCounts(media, new Set(['a']), {});
    expect(counts.all).toBe(2);
    expect(counts.favorites).toBe(1);
  });

  it('filters and decorates visible media', () => {
    const filtered = selectFilteredMedia(
      media,
      { ...state, filter: 'all', sort: 'alphabetical', mediaDurationSorted: [] },
      { deferredQuery: '', activePlaylistId: null, favoriteIds: new Set(['b']), playedAtById: {} }
    );
    const visible = selectVisibleMedia(filtered, new Set(['b']), {});
    expect(visible.find((row) => row.id === 'b')?.favorite).toBe(true);
  });
});
