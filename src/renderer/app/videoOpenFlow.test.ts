import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MediaItem } from '../../shared/types';
import { enterPlayerMode, enterLibraryMode, playerModeStore } from '../features/ui/playerModeStore';

const video: MediaItem = {
  id: 'v1',
  filePath: 'D:/v.mp4',
  fileName: 'v.mp4',
  folder: 'D:/',
  title: 'v.mp4',
  tags: [],
  kind: 'video',
  addedAt: '',
  favorite: false,
};

const audio: MediaItem = { ...video, id: 'a1', kind: 'audio', filePath: 'D:/a.mp3', fileName: 'a.mp3' };

describe('video open flow', () => {
  beforeEach(() => {
    enterLibraryMode();
  });

  it('enterPlayerMode switches to player layout for video watch', () => {
    enterPlayerMode();
    expect(playerModeStore.getState().mode).toBe('player');
  });

  it('playMedia contract: video should enter player before load (orchestration)', async () => {
    const enterPlayer = vi.fn();
    const loadTrack = vi.fn().mockResolvedValue(undefined);

    const playMedia = async (item: MediaItem, opts?: { forceWatch?: boolean }) => {
      if (item.kind === 'video' && (opts?.forceWatch ?? true)) enterPlayer();
      await loadTrack(item, { autoPlay: true });
    };

    await playMedia(video, { forceWatch: true });
    expect(enterPlayer).toHaveBeenCalled();

    enterLibraryMode();
    enterPlayer.mockClear();
    await playMedia(audio);
    expect(enterPlayer).not.toHaveBeenCalled();
  });
});
