import { useCallback, useMemo, useRef } from 'react';
import type { AppSettings, MediaItem, QueueItem, RepeatMode } from '../../shared/types';
import { shouldIncludeInLibrary } from '../../shared/mediaFileFilter';
import { isPlayableLocalMediaItem } from '../lib/mediaIntelligence/playableMediaFilter';
import { buildPlaybackSequence, findNextTrack, findPreviousTrack, noteShufflePlay } from '../lib/playbackNavigation';
import { resolveSmartPlaylistMediaIds } from '../lib/smartPlaylists';
import { noteMediaPlayed } from '../features/library/historyStore';
import { toggleFavoriteItem } from '../features/library/favoritesStore';
import { setLibraryFocusedRowId } from '../features/library/libraryStore';
import {
  addMediaBatchToQueue,
  addMediaToQueue,
  addToPlaylist,
  createPlaylist,
  renamePlaylist,
  toggleActivePlaylist
} from '../features/queue/queueStore';
import { setLibraryFilter } from '../features/library/libraryStore';
import { saveSettingsPatch } from '../features/settings/settingsStore';
import { playUiSound, configureUiAudio } from '../services/uiAudioService';
import { smartOpenMedia } from '../lib/mediaIntelligence/smartOpenMedia';
import {
  perfMarkVideoPlaybackIntent,
  perfMarkVideoSwitchDone,
  perfMarkVideoSwitchStart,
} from '../lib/perfReport';
import type { PlaybackActions } from '../playback/usePlayback';
import type { UnifiedPlaybackState } from '../playback/playbackTypes';

export interface PlaybackOrchestrationRefs {
  mediaRef: React.MutableRefObject<MediaItem[]>;
  queueRef: React.MutableRefObject<QueueItem[]>;
  currentMediaRef: React.MutableRefObject<MediaItem | undefined>;
  playbackStateRef: React.MutableRefObject<UnifiedPlaybackState>;
  durationByIdRef: React.MutableRefObject<Record<string, number>>;
  playGenerationRef: React.MutableRefObject<number>;
}

export function usePlaybackOrchestration(options: {
  playbackActions: PlaybackActions;
  playbackState: UnifiedPlaybackState;
  showToast: (text: string, options?: import('../components/ToastStack').ToastOptions | number) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  favoriteIds: Set<string>;
  playedAtById: Record<string, string>;
  playlists: import('../../shared/types').Playlist[];
  refs: PlaybackOrchestrationRefs;
  modeTransitions: {
    enterPlayer: () => void;
    enterLibrary: () => void;
  };
  settings?: AppSettings;
  playerMode?: string;
}) {
  const { playbackActions, playbackState, showToast, t, favoriteIds, playedAtById, playlists, refs, modeTransitions, settings, playerMode } = options;

  const navOptions = useMemo(() => ({
    repeat: playbackState.repeat,
    shuffle: playbackState.shuffle
  }), [playbackState.repeat, playbackState.shuffle]);

  const playMedia = useCallback(async (
    item: MediaItem,
    playOptions?: { forceWatch?: boolean; source?: import('../lib/mediaIntelligence/smartOpenMedia').SmartOpenSource }
  ) => {
    const generation = ++refs.playGenerationRef.current;
    setLibraryFocusedRowId(item.id);

    if (!item.filePath) {
      showToast(t('error.demoTrack'));
      return;
    }

    if (
      !shouldIncludeInLibrary(item.filePath, item.fileName)
      || !isPlayableLocalMediaItem(item)
    ) {
      showToast(t('error.media.notPlayable'));
      return;
    }

    try {
      if (item.kind === 'video') perfMarkVideoSwitchStart();

      const open = await smartOpenMedia({
        item,
        settings,
        playbackActions,
        options: {
          forceWatch: playOptions?.forceWatch,
          source: playOptions?.source,
          playerMode,
          alreadyPlayingId: refs.playbackStateRef.current.currentTrack?.id,
        },
      });

      perfMarkVideoPlaybackIntent();
      if (item.kind === 'video' && open.enterWatch) perfMarkVideoSwitchDone();

      if (generation !== refs.playGenerationRef.current) return;
      noteMediaPlayed(item.id);
      if (refs.playbackStateRef.current.shuffle) noteShufflePlay(item.id);
    } catch (error) {
      if (generation !== refs.playGenerationRef.current) return;
      if (import.meta.env?.DEV) console.error('[Virelia] playMedia failed', error);
      showToast(t('error.media.unknown'));
    }
  }, [playbackActions, playerMode, refs, settings, showToast, t]);

  const playbackSequence = useCallback(
    () => buildPlaybackSequence(refs.queueRef.current, refs.mediaRef.current),
    [refs]
  );

  const playPrevious = useCallback(() => {
    const previous = findPreviousTrack(playbackSequence(), refs.currentMediaRef.current, navOptions);
    if (!previous) {
      showToast(refs.currentMediaRef.current ? t('toast.nothingPrevious') : t('toast.selectTrackFirst'));
      return;
    }
    void playMedia(previous);
  }, [navOptions, playMedia, playbackSequence, refs, showToast, t]);

  const playNext = useCallback(() => {
    const current = refs.currentMediaRef.current;
    if (navOptions.repeat === 'one' && current?.filePath) {
      void playMedia(current);
      return;
    }
    const next = findNextTrack(playbackSequence(), current, navOptions);
    if (!next || (current && next.id === current.id)) {
      showToast(current ? t('toast.nothingNext') : t('toast.noTracks'));
      return;
    }
    playUiSound('confirm');
    void playMedia(next);
  }, [navOptions, playMedia, playbackSequence, refs, showToast, t]);

  const togglePlayback = useCallback(() => {
    void playbackActions.togglePlay();
  }, [playbackActions]);

  const addToQueue = useCallback((item: MediaItem) => {
    if (!addMediaToQueue(item)) {
      showToast(t('toast.alreadyInQueue'), { key: 'queue-batch', durationMs: 3000 });
      return;
    }
    playUiSound('queue_add');
    showToast(t('toast.addedToQueue'), { key: 'queue-batch', durationMs: 3000 });
  }, [showToast, t]);

  const addManyToQueue = useCallback((items: MediaItem[]) => {
    const added = addMediaBatchToQueue(items);
    if (added === 0) {
      showToast(t('toast.alreadyInQueue'), { key: 'queue-batch', durationMs: 3000 });
      return 0;
    }
    playUiSound('queue_add');
    showToast(t('toast.queueBatchAdded', { count: added }), { key: 'queue-batch', durationMs: 3000 });
    return added;
  }, [showToast, t]);

  const toggleFavorite = useCallback((item: MediaItem) => {
    toggleFavoriteItem(item);
  }, []);

  const addToPlaylistHandler = useCallback((playlistId: string, item: MediaItem) => {
    addToPlaylist(playlistId, item.id);
    showToast(t('toast.addedToPlaylist'));
  }, [showToast, t]);

  const selectPlaylist = useCallback((playlistId: string) => {
    toggleActivePlaylist(playlistId);
    setLibraryFilter('all');
  }, []);

  const playPlaylist = useCallback((playlistId: string) => {
    const playlist = playlists.find((item) => item.id === playlistId);
    if (!playlist) return;
    const ids = playlist.smart
      ? resolveSmartPlaylistMediaIds(playlist.smart, refs.mediaRef.current, favoriteIds, playedAtById, refs.durationByIdRef.current)
      : playlist.mediaIds;
    const first = refs.mediaRef.current.find((item) => ids.includes(item.id));
    if (!first) {
      showToast(t('toast.playlistEmpty'));
      return;
    }
    void playMedia(first);
  }, [favoriteIds, playMedia, playedAtById, playlists, refs, showToast, t]);

  const saveSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await saveSettingsPatch(patch);
    if (patch.uiSounds) {
      configureUiAudio(next.uiSounds);
    }
    if (patch.playback?.mpvPath !== undefined || patch.playback?.preferredEngine !== undefined) {
      const status = await window.prism.playback.reloadEngine();
      playbackActions.setRepeat(status.repeat);
      playbackActions.setShuffle(status.shuffle);
    }
  }, [playbackActions]);

  const setRepeatMode = useCallback(async (repeat: RepeatMode) => {
    await window.prism.playback.setRepeat(repeat);
    playbackActions.setRepeat(repeat);
  }, [playbackActions]);

  const setShuffleMode = useCallback(async (shuffle: boolean) => {
    await window.prism.playback.setShuffle(shuffle);
    playbackActions.setShuffle(shuffle);
  }, [playbackActions]);

  const shortcutRefs = useRef({
    togglePlayback: () => undefined as void,
    playNext: () => undefined as void,
    playPrevious: () => undefined as void,
    playMedia: (_item: MediaItem, _opts?: { forceWatch?: boolean }) => undefined as void
  });

  shortcutRefs.current.togglePlayback = () => { void togglePlayback(); };
  shortcutRefs.current.playNext = () => playNext();
  shortcutRefs.current.playPrevious = () => playPrevious();
  shortcutRefs.current.playMedia = (item, opts) => { void playMedia(item, opts); };

  return {
    playMedia,
    playNext,
    playPrevious,
    togglePlayback,
    addToQueue,
    addManyToQueue,
    toggleFavorite,
    addToPlaylistHandler,
    selectPlaylist,
    playPlaylist,
    saveSettings,
    setRepeatMode,
    setShuffleMode,
    createPlaylist,
    renamePlaylist,
    shortcutRefs
  };
}
