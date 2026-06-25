// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { MediaItem, QueueItem } from '../../../shared/types';
import { createPlaybackStore } from '../../playback/playbackStore';
import {
  enterLibraryMode,
  enterMiniMode,
  enterPlayerMode,
  exitMiniMode,
  playerModeStore
} from './playerModeStore';
import { queueStore } from '../queue/queueStore';

const sampleTrack: MediaItem = {
  id: 'track-1',
  filePath: '/media/sample.mp3',
  fileName: 'sample.mp3',
  folder: '/media',
  title: 'Sample',
  tags: [],
  kind: 'audio',
  durationSeconds: 120,
  addedAt: '2026-01-01T00:00:00.000Z',
  favorite: false
};

const sampleQueue: QueueItem[] = [
  { id: 'q-1', mediaId: 'track-1', pinned: false, addedAt: '2026-01-01T00:00:00.000Z' }
];

describe('player mode vs playback isolation', () => {
  beforeEach(() => {
    playerModeStore.setState({ mode: 'library', returnMode: 'library', videoTheater: false });
    queueStore.setState({ queue: [...sampleQueue], playlists: [], activePlaylistId: null });
    localStorage.clear();
  });

  it('mode transitions do not mutate an independent playback snapshot', () => {
    const playback = createPlaybackStore({
      currentTrack: sampleTrack,
      currentTime: 42,
      playbackStatus: 'playing'
    });
    const snapshot = playback.getState();

    enterPlayerMode();
    enterLibraryMode();
    enterMiniMode();
    exitMiniMode();

    expect(playback.getState().currentTrack).toEqual(snapshot.currentTrack);
    expect(playback.getState().currentTime).toBe(42);
    expect(playback.getState().playbackStatus).toBe('playing');
  });

  it('mode transitions do not clear queue or playlists', () => {
    const playlists = queueStore.getState().playlists;

    enterPlayerMode();
    enterMiniMode();
    exitMiniMode();
    enterLibraryMode();

    expect(queueStore.getState().queue).toEqual(sampleQueue);
    expect(queueStore.getState().playlists).toEqual(playlists);
  });
});
