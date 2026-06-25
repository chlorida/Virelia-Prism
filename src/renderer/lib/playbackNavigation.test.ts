import { describe, expect, it } from 'vitest';
import type { MediaItem, QueueItem } from '../../shared/types';
import { buildPlaybackSequence, findNextTrack, findPreviousTrack } from './playbackNavigation';

const media = (id: string): MediaItem => ({
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

describe('playbackNavigation', () => {
  it('prefers queue order before library list', () => {
    const queue: QueueItem[] = [{ id: 'q1', mediaId: 'b', pinned: false, addedAt: '' }];
    const sequence = buildPlaybackSequence(queue, [media('a'), media('b'), media('c')]);
    expect(sequence.map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not wrap to the same track at the end', () => {
    const items = [media('a'), media('b')];
    expect(findNextTrack(items, items[1])?.id).toBeUndefined();
    expect(findPreviousTrack(items, items[0])?.id).toBeUndefined();
  });

  it('wraps with repeat all', () => {
    const items = [media('a'), media('b')];
    expect(findNextTrack(items, items[1], { repeat: 'all', shuffle: false })?.id).toBe('a');
  });

  it('keeps current track with repeat one', () => {
    const items = [media('a'), media('b')];
    expect(findNextTrack(items, items[0], { repeat: 'one', shuffle: false })?.id).toBe('a');
  });
});
