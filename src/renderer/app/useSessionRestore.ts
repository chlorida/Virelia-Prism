import { useCallback } from 'react';
import type { AppSettings, MediaItem } from '../../shared/types';
import {
  clearPlaybackSession,
  loadPlaybackSession,
  resolveRestorePosition
} from '../lib/playbackPersistence';
import { loadPreviewCollapsed } from '../playback/mediaPersistence';
import { setLibraryFocusedRowId } from '../features/library/libraryStore';
import type { PlaybackActions } from '../playback/usePlayback';

export function useSessionRestore(options: {
  playbackActions: PlaybackActions;
  durationByIdRef: React.MutableRefObject<Record<string, number>>;
  showToast: (text: string) => void;
  t: (key: 'error.trackUnavailable') => string;
}) {
  const { playbackActions, durationByIdRef, showToast, t } = options;

  return useCallback(async (items: MediaItem[], _loadedSettings: AppSettings) => {
    const session = loadPlaybackSession();
    if (!session) return;

    const item = items.find((row) => row.id === session.currentTrackId);
    if (!item?.filePath) {
      clearPlaybackSession();
      showToast(t('error.trackUnavailable'));
      return;
    }

    const knownDuration = item.durationSeconds
      ?? durationByIdRef.current[item.id]
      ?? (session.duration > 0 ? session.duration : undefined);
    const position = resolveRestorePosition(session.currentTime, knownDuration);

    try {
      await playbackActions.whenReady();
    } catch {
      return;
    }

    playbackActions.setVolume(session.volume);
    playbackActions.setPlaybackRate(session.playbackRate);
    playbackActions.setMuted(session.muted);
    setLibraryFocusedRowId(item.id);
    playbackActions.setPreviewCollapsed(loadPreviewCollapsed());

    try {
      await playbackActions.loadTrack(item, {
        autoPlay: false,
        startSeconds: position,
        muted: session.muted
      });
    } catch {
      clearPlaybackSession();
      showToast(t('error.trackUnavailable'));
    }
  }, [durationByIdRef, playbackActions, showToast, t]);
}
