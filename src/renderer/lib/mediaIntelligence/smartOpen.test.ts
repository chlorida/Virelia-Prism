import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import { resolveSmartOpen } from './smartOpen';

const episode: MediaItem = {
  id: 'ep',
  filePath: 'D:/Anime/[SubsPlease] Sotsu - 05.mkv',
  fileName: '[SubsPlease] Sotsu - 05.mkv',
  folder: 'D:/Anime',
  title: 'Sotsu 05',
  tags: [],
  kind: 'video',
  addedAt: '',
  favorite: false,
};

const audio: MediaItem = { ...episode, id: 'a', kind: 'audio', filePath: 'D:/a.flac', fileName: 'a.flac' };

describe('resolveSmartOpen', () => {
  it('video episode from library with audio already playing enters watch', () => {
    const open = resolveSmartOpen(episode, undefined, {
      alreadyPlayingId: audio.id,
      playerMode: 'library',
    });
    expect(open.enterWatch).toBe(true);
    expect(open.autoPlay).toBe(true);
  });

  it('same video already playing in watch mode does not restart', () => {
    const open = resolveSmartOpen(episode, undefined, {
      alreadyPlayingId: episode.id,
      playerMode: 'player',
    });
    expect(open.enterWatch).toBe(false);
    expect(open.autoPlay).toBe(false);
  });

  it('same video in library focuses watch without restart', () => {
    const open = resolveSmartOpen(episode, undefined, {
      alreadyPlayingId: episode.id,
      playerMode: 'library',
    });
    expect(open.enterWatch).toBe(true);
    expect(open.autoPlay).toBe(false);
  });

  it('audio does not enter watch', () => {
    const open = resolveSmartOpen(audio, undefined);
    expect(open.enterWatch).toBe(false);
  });

  it('forceWatch always watch', () => {
    const open = resolveSmartOpen(episode, undefined, { forceWatch: true });
    expect(open.enterWatch).toBe(true);
  });
});
