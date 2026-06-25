import { describe, expect, it } from 'vitest';
import { appendPlaybackHistory, resolveHistoryMedia } from './playbackHistory';
import type { MediaItem } from '../../shared/types';

const item = (id: string): MediaItem => ({
  id,
  filePath: `C:/music/${id}.mp3`,
  fileName: `${id}.mp3`,
  folder: 'C:/music',
  title: id,
  tags: [],
  kind: 'audio',
  addedAt: '2026-01-01T00:00:00.000Z',
  favorite: false
});

describe('playbackHistory', () => {
  it('moves latest play to front without duplicates', () => {
    const next = appendPlaybackHistory(['a', 'b'], 'c');
    expect(next).toEqual(['c', 'a', 'b']);
    expect(appendPlaybackHistory(next, 'a')).toEqual(['a', 'c', 'b']);
  });

  it('resolves history items from library', () => {
    const media = [item('a'), item('b')];
    expect(resolveHistoryMedia(['b', 'missing', 'a'], media).map((row) => row.id)).toEqual(['b', 'a']);
  });
});
