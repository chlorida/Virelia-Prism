import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AppSettings, MediaItem } from '../../../shared/types';
import { enterLibraryMode, playerModeStore } from '../../features/ui/playerModeStore';
import { smartOpenMedia } from './smartOpenMedia';
import { resolveSmartOpen } from './smartOpen';

const base: MediaItem = {
  id: 'ep1',
  filePath: 'D:/Anime/Sotsu EP05.mkv',
  fileName: 'Sotsu EP05.mkv',
  folder: 'D:/Anime',
  title: 'Sotsu EP05.mkv',
  tags: [],
  kind: 'video',
  addedAt: '',
  favorite: false,
};

const audio: MediaItem = { ...base, id: 'a1', kind: 'audio', filePath: 'D:/a.flac', fileName: 'a.flac' };

describe('smartOpenMedia', () => {
  beforeEach(() => {
    enterLibraryMode();
  });

  it('skips reload when the same video is already playing without autoplay', async () => {
    const loadTrack = vi.fn().mockResolvedValue(undefined);
    const setPreviewCollapsed = vi.fn();

    await smartOpenMedia({
      item: base,
      playbackActions: { loadTrack, setPreviewCollapsed },
      options: { alreadyPlayingId: base.id, playerMode: 'library', autoplay: false },
    });

    expect(playerModeStore.getState().mode).toBe('player');
    expect(setPreviewCollapsed).toHaveBeenCalledWith(false);
    expect(loadTrack).not.toHaveBeenCalled();
  });

  it('audio playing + video row play enters Watch Mode before load', async () => {
    const loadTrack = vi.fn().mockResolvedValue(undefined);
    const setPreviewCollapsed = vi.fn();

    await smartOpenMedia({
      item: base,
      playbackActions: { loadTrack, setPreviewCollapsed },
      options: { alreadyPlayingId: audio.id, playerMode: 'library' },
    });

    expect(playerModeStore.getState().mode).toBe('player');
    expect(setPreviewCollapsed).toHaveBeenCalledWith(false);
    expect(loadTrack).toHaveBeenCalledWith(base, { autoPlay: true });
  });

  it('audio row does not enter Watch Mode', async () => {
    const loadTrack = vi.fn().mockResolvedValue(undefined);
    await smartOpenMedia({
      item: audio,
      playbackActions: { loadTrack, setPreviewCollapsed: vi.fn() },
    });
    expect(playerModeStore.getState().mode).toBe('library');
  });

  it('forceWatch always enters Watch Mode', () => {
    const decision = resolveSmartOpen(base, undefined, { forceWatch: true });
    expect(decision.enterWatch).toBe(true);
    expect(decision.autoPlay).toBe(true);
  });
});
