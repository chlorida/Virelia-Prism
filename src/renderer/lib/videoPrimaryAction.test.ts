import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../shared/types';
import { resolveBottomVideoOpenLabel, resolveVideoRowPlayAction } from './videoPrimaryAction';

const video: MediaItem = {
  id: 'v1',
  filePath: 'D:/a.mkv',
  fileName: 'a.mkv',
  folder: 'D:/',
  title: 'Ep 1',
  tags: [],
  kind: 'video',
  addedAt: '',
  favorite: false,
};

describe('videoPrimaryAction', () => {
  it('video row play uses forceWatch for new item', () => {
    const action = resolveVideoRowPlayAction(video, {
      isCurrent: false,
      isPlaying: false,
    });
    expect(action.forceWatch).toBe(true);
    expect(action.labelKey).toBe('player.play');
  });

  it('current playing video shows watching/focus', () => {
    const action = resolveVideoRowPlayAction(video, {
      isCurrent: true,
      isPlaying: true,
      playbackStatus: 'playing',
      inWatchMode: true,
    });
    expect(action.labelKey).toBe('player.watching');
    expect(action.forceWatch).toBe(false);
  });

  it('audio row action is not video-specific', () => {
    const audio = { ...video, id: 'a1', kind: 'audio' as const, filePath: 'D:/a.flac', fileName: 'a.flac' };
    expect(resolveVideoRowPlayAction(audio, { isCurrent: false, isPlaying: false }).forceWatch).toBe(true);
  });

  it('bottom open label in watch mode is focus', () => {
    expect(resolveBottomVideoOpenLabel({ isCurrent: true, inWatchMode: true })).toBe('player.focusPlayer');
  });
});
