import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYBACK_SESSION_KEY,
  loadPlaybackSession,
  resolveRestorePosition,
  savePlaybackSession
} from './playbackPersistence';

function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); }
  });
}

describe('resolveRestorePosition', () => {
  it('keeps position when not near end', () => {
    expect(resolveRestorePosition(47, 180)).toBe(47);
  });

  it('resets when within 5 seconds of duration', () => {
    expect(resolveRestorePosition(176, 180)).toBe(0);
  });
});

describe('playback session persistence', () => {
  beforeEach(() => {
    installLocalStorageMock();
    localStorage.clear();
  });

  it('round-trips full playback session fields', () => {
    savePlaybackSession({
      mediaId: 'track-1',
      filePath: 'D:\\music\\song.mp3',
      positionSeconds: 45,
      durationSeconds: 180,
      volume: 0.6,
      muted: true,
      playbackRate: 1.25
    });

    const session = loadPlaybackSession();
    expect(session).toMatchObject({
      currentTrackId: 'track-1',
      currentPath: 'D:\\music\\song.mp3',
      currentTime: 45,
      duration: 180,
      volume: 0.6,
      muted: true,
      playbackRate: 1.25
    });
    expect(session?.updatedAt).toBeTruthy();
  });

  it('migrates legacy mediaId session shape', () => {
    localStorage.setItem(PLAYBACK_SESSION_KEY, JSON.stringify({
      mediaId: 'legacy-track',
      positionSeconds: 12
    }));

    expect(loadPlaybackSession()).toMatchObject({
      currentTrackId: 'legacy-track',
      currentTime: 12
    });
  });
});