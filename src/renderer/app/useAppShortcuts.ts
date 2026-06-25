import { useEffect } from 'react';
import type { AppSettings, MediaItem } from '../../shared/types';
import { savePlaybackSession } from '../lib/playbackPersistence';
import { flushPersistedPlaybackSettings } from '../lib/persistPlaybackSettings';
import { resetAppLocalState } from '../lib/appStateReset';
import { getPrism } from '../lib/prismApi';
import { playerModeStore } from '../features/ui/playerModeStore';
import { isPlayPauseKey, shouldIgnorePlayerHotkey } from '../lib/playerHotkeys';
import type { PlaybackActions } from '../playback/usePlayback';
import type { UnifiedPlaybackState } from '../playback/playbackTypes';
import type { AppShellPromptState } from './useAppShellController';

export function useAppShortcuts(options: {
  settingsOpen: boolean;
  prompt: AppShellPromptState | null;
  playbackActions: PlaybackActions;
  playbackStateRef: React.MutableRefObject<UnifiedPlaybackState>;
  videoTheaterRef: React.MutableRefObject<boolean>;
  modeTransitions: {
    exitVideoTheater: () => void;
    enterLibrary: () => void;
    toggleMini: () => void;
    restoreMini: () => void;
  };
  visibleMediaRef: React.MutableRefObject<MediaItem[]>;
  focusedRowIdRef: React.MutableRefObject<string | undefined>;
  currentMediaRef: React.MutableRefObject<MediaItem | undefined>;
  moveFocusedRowRef: React.MutableRefObject<(delta: number) => void>;
  shortcutRefs: React.MutableRefObject<{
    togglePlayback: () => void;
    playNext: () => void;
    playPrevious: () => void;
    playMedia: (item: MediaItem, opts?: { forceWatch?: boolean }) => void;
  }>;
  addToQueue: (item: MediaItem) => void;
  toggleFavorite: (item: MediaItem) => void;
  setSettingsOpen: (open: boolean) => void;
}) {
  useEffect(() => {
    const prism = getPrism();
    const onKeyDown = (event: KeyboardEvent) => {
      if (options.settingsOpen || options.prompt) return;
      if (shouldIgnorePlayerHotkey(event)) return;

      const snap = options.playbackStateRef.current;

      if (isPlayPauseKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;

        if (snap.currentTrack?.filePath) {
          void options.playbackActions.togglePlay();
          return;
        }

        const focused = options.focusedRowIdRef.current
          ? options.visibleMediaRef.current.find((row) => row.id === options.focusedRowIdRef.current)
          : undefined;
        if (focused?.filePath) {
          options.shortcutRefs.current.playMedia(focused, {
            forceWatch: focused.kind === 'video',
          });
        }
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.search-box input')?.focus();
      }

      const videoActive = playerModeStore.getState().mode === 'player'
        && snap.isPreviewVisible
        && Boolean(snap.currentTrack?.filePath);
      if (videoActive && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.code === 'ArrowLeft') {
          event.preventDefault();
          void options.playbackActions.seek(Math.max(0, snap.currentTime - 10));
          return;
        }
        if (event.code === 'ArrowRight') {
          event.preventDefault();
          void options.playbackActions.seek(snap.currentTime + 10);
          return;
        }
        if (event.code === 'ArrowUp') {
          event.preventDefault();
          options.playbackActions.setVolume(Math.min(1, snap.volume + 0.05));
          return;
        }
        if (event.code === 'ArrowDown') {
          event.preventDefault();
          options.playbackActions.setVolume(Math.max(0, snap.volume - 0.05));
          return;
        }
        if (event.key.toLowerCase() === 'm') {
          event.preventDefault();
          options.playbackActions.setMuted(!snap.muted);
          return;
        }
        if (event.key.toLowerCase() === 'f') {
          event.preventDefault();
          options.playbackActions.enterFullscreen();
          return;
        }
      }

      if (event.key === 'ArrowLeft') options.shortcutRefs.current.playPrevious();
      if (event.key === 'ArrowRight') options.shortcutRefs.current.playNext();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        options.moveFocusedRowRef.current(event.key === 'ArrowDown' ? 1 : -1);
      }
      if (event.key === 'Enter' && options.focusedRowIdRef.current) {
        event.preventDefault();
        const item = options.visibleMediaRef.current.find((row) => row.id === options.focusedRowIdRef.current);
        if (item) {
          options.shortcutRefs.current.playMedia(item, { forceWatch: item.kind === 'video' });
        }
      }
      if (event.key.toLowerCase() === 'q' && options.currentMediaRef.current) {
        options.addToQueue(options.currentMediaRef.current);
      }
      if (event.key.toLowerCase() === 'f' && options.currentMediaRef.current) {
        options.toggleFavorite(options.currentMediaRef.current);
      }
      if (event.code === 'Escape' && options.videoTheaterRef.current) {
        event.preventDefault();
        options.modeTransitions.exitVideoTheater();
        return;
      }
      if (event.code === 'Escape' && playerModeStore.getState().mode === 'player') {
        event.preventDefault();
        options.modeTransitions.enterLibrary();
        return;
      }
      if (event.code === 'Escape' && playerModeStore.getState().mode === 'mini') {
        event.preventDefault();
        options.modeTransitions.restoreMini();
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        options.modeTransitions.toggleMini();
      }
      if (event.ctrlKey && event.shiftKey && event.altKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        resetAppLocalState();
        window.location.reload();
      }
      if (event.ctrlKey && event.key === ',') options.setSettingsOpen(true);
    };

    const flushPersistence = () => {
      const api = getPrism();
      flushPersistedPlaybackSettings((patch: Partial<AppSettings['playback']>) => {
        void api?.settings.save({ playback: patch } as Partial<AppSettings>);
      });
      const snap = options.playbackStateRef.current;
      const track = snap.currentTrack;
      if (track?.filePath) {
        savePlaybackSession({
          mediaId: track.id,
          filePath: track.filePath,
          positionSeconds: snap.currentTime,
          durationSeconds: snap.duration,
          volume: snap.volume,
          muted: snap.muted,
          playbackRate: snap.playbackRate
        });
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('beforeunload', flushPersistence);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPersistence();
    });
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('beforeunload', flushPersistence);
      document.removeEventListener('visibilitychange', flushPersistence);
    };
  }, [options]);
}
