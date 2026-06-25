import { describe, expect, it } from 'vitest';
import { resolveFavoriteMedia } from './librarySelectors';
import type { MediaItem } from '../../../shared/types';
import {
  flushLibraryScanProgressThrottle,
  getLastLibraryScanProgressAt,
  noteLibraryScanProgressPayload,
  resetLibraryScanProgressClock,
} from '../../lib/libraryScanProgress';

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
    favorite: true,
  };
}

describe('library performance helpers', () => {
  it('resolves favorites without scanning full library', () => {
    const map = new Map([['a', item('a')], ['b', item('b')]]);
    const favorites = resolveFavoriteMedia(new Set(['a']), map);
    expect(favorites).toHaveLength(1);
    expect(favorites[0]?.id).toBe('a');
  });

  it('tracks scan progress without library store', () => {
    resetLibraryScanProgressClock();
    noteLibraryScanProgressPayload({
      currentPath: 'D:/a.mp3',
      scanned: 10,
      added: 5,
      skipped: 0,
      done: false,
    });
    expect(getLastLibraryScanProgressAt()).not.toBeNull();
    flushLibraryScanProgressThrottle();
  });
});
