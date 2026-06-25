import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { defaultSettings } from '../../shared/defaults';
import type { MediaItem, QueueItem } from '../../shared/types';
import { usePlaybackActions, usePlaybackSelector, usePlaybackStore } from '../playback/usePlayback';
import { isActivelyPlaying } from '../playback/playbackTypes';
import { useToast } from '../components/ToastStack';
import { useI18n } from '../i18n/I18nProvider';
import { usePlayerModeTransitions } from '../features/ui/usePlayerModeTransitions';
import { playerModeStore } from '../features/ui/playerModeStore';
import { useStore } from '../lib/useStore';
import { absorbLibraryScan, importLibraryFolder, resetLibraryIndex, retryLibraryScan } from '../features/library/libraryService';
import {
  libraryStore,
  setLibraryFocusedRowId
} from '../features/library/libraryStore';
import { markKeyboardListNavigation } from '../lib/keyboardNavFocus';
import { useLibraryDerivedContext } from './LibraryDerivedContext';
import { useLibraryScanEvents } from '../features/library/useLibraryScanEvents';
import { queueStore } from '../features/queue/queueStore';
import { settingsStore } from '../features/settings/settingsStore';
import type { LibraryScanResult } from '../../shared/types';
import { useAppBootstrap } from './useAppBootstrap';
import { useAppShortcuts } from './useAppShortcuts';
import { useAppShellLayout } from './useAppShellLayout';
import { setSidebarCollapsed, setSidebarPinLocked, sidebarChromeStore } from '../features/ui/sidebarChromeStore';
import { useDragDropImport } from './useDragDropImport';
import { useDurationEnrichment } from './useDurationEnrichment';
import { useMediaSessionBridge } from './useMediaSessionBridge';
import { usePlaybackOrchestration } from './usePlaybackOrchestration';
import { useSessionRestore } from './useSessionRestore';
import { useAppLayoutMode } from '../hooks/useAppLayoutMode';

export type AppShellPromptState =
  | { type: 'create-playlist' }
  | { type: 'rename-playlist'; playlistId: string; defaultValue: string };

export function useAppShellController(props: {
  onEndedRef: React.MutableRefObject<() => void>;
}) {
  const { actions: playbackActions, controllerReady } = usePlaybackActions();
  const playbackStore = usePlaybackStore();
  const currentTrack = usePlaybackSelector((s) => s.currentTrack);
  const playbackStatus = usePlaybackSelector((s) => s.playbackStatus);
  const isVideo = usePlaybackSelector((s) => s.isVideo);
  const isPreviewCollapsed = usePlaybackSelector((s) => s.isPreviewCollapsed);
  const playbackDuration = usePlaybackSelector((s) => s.duration);
  const playbackError = usePlaybackSelector((s) => s.error);
  const [bootError, setBootError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prompt, setPrompt] = useState<AppShellPromptState | null>(null);

  const playbackStateRef = useRef(playbackStore.getState());
  useEffect(() => playbackStore.subscribe((state) => {
    playbackStateRef.current = state;
  }), [playbackStore]);
  const currentMedia = currentTrack ?? undefined;

  const mediaRef = useRef<MediaItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const visibleMediaRef = useRef<MediaItem[]>([]);
  const currentMediaRef = useRef<MediaItem | undefined>(undefined);
  const durationByIdRef = useRef<Record<string, number>>({});
  const playGenerationRef = useRef(0);
  const focusedRowIdRef = useRef<string | undefined>(undefined);
  const absorbLibraryScanRef = useRef<(result: LibraryScanResult, options?: { notify?: boolean; background?: boolean }) => Promise<void>>(
    async () => undefined
  );
  const showToastRef = useRef<(text: string) => void>(() => undefined);
  const videoTheaterRef = useRef(false);

  const { t } = useI18n();
  const translate = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      t(key as Parameters<typeof t>[0], params),
    [t]
  );
  const tRef = useRef(translate);
  const { messages: toastMessages, exitingIds: toastExitingIds, showToast, clearToasts } = useToast();
  showToastRef.current = showToast;
  tRef.current = translate;

  const settings = useStore(settingsStore, (state) => state.settings ?? defaultSettings);
  const settingsLoaded = useStore(settingsStore, (state) => state.loaded);
  const libraryLoading = useStore(libraryStore, (state) => state.loading);
  const libraryBoot = useStore(libraryStore, (state) => state.boot);
  const libraryBootError = useStore(libraryStore, (state) => state.bootError);
  const libraryScanning = useStore(libraryStore, (state) => state.scanning);
  const libraryMediaCount = useStore(libraryStore, (state) => state.media.length);
  const query = useStore(libraryStore, (state) => state.query);
  const filter = useStore(libraryStore, (state) => state.filter);
  const sort = useStore(libraryStore, (state) => state.sort);
  const durationById = useStore(libraryStore, (state) => state.durationById);
  const focusedRowId = useStore(libraryStore, (state) => state.focusedRowId);
  const queue = useStore(queueStore, (state) => state.queue);
  const playlists = useStore(queueStore, (state) => state.playlists);
  const activePlaylistId = useStore(queueStore, (state) => state.activePlaylistId);
  const playerMode = useStore(playerModeStore, (state) => state.mode);
  const videoTheaterOpen = useStore(playerModeStore, (state) => state.videoTheater);
  videoTheaterRef.current = videoTheaterOpen;

  const derived = useLibraryDerivedContext();
  const debouncedQuery = useDebouncedValue(query, 280);
  const deferredQuery = debouncedQuery;
  const modeTransitions = usePlayerModeTransitions();
  const layoutMode = useAppLayoutMode();

  useLibraryScanEvents(showToast, translate);
  const dragActive = useDragDropImport(showToast, translate);

  const orchestrationRefs = useMemo(() => ({
    mediaRef,
    queueRef,
    currentMediaRef,
    playbackStateRef,
    durationByIdRef,
    playGenerationRef
  }), []);

  const orchestration = usePlaybackOrchestration({
    playbackActions,
    playbackState: playbackStateRef.current,
    showToast,
    t: translate,
    favoriteIds: derived.favoriteIds,
    playedAtById: derived.playedAtById,
    playlists,
    refs: orchestrationRefs,
    modeTransitions,
    settings,
    playerMode,
  });

  const restorePlaybackSession = useSessionRestore({
    playbackActions,
    durationByIdRef,
    showToast,
    t: translate
  });

  const handleAbsorbLibraryScan = useCallback(async (
    result: LibraryScanResult,
    options?: { notify?: boolean; background?: boolean }
  ) => {
    await absorbLibraryScan(result, {
      ...options,
      showToast,
      t: translate
    });
  }, [showToast, translate]);

  absorbLibraryScanRef.current = handleAbsorbLibraryScan;

  useAppBootstrap({
    setBootError,
    showToastRef,
    tRef,
    playbackActions,
    restorePlaybackSession,
    absorbLibraryScanRef,
    shortcutRefs: orchestration.shortcutRefs,
    setSettingsOpen
  });

  const moveFocusedRow = useCallback((delta: number) => {
    const rows = visibleMediaRef.current;
    if (rows.length === 0) return;
    const currentIndex = rows.findIndex((row) => row.id === focusedRowIdRef.current);
    const nextIndex = currentIndex < 0
      ? (delta > 0 ? 0 : rows.length - 1)
      : Math.max(0, Math.min(rows.length - 1, currentIndex + delta));
    markKeyboardListNavigation();
    setLibraryFocusedRowId(rows[nextIndex]?.id);
  }, []);

  const moveFocusedRowRef = useRef(moveFocusedRow);
  moveFocusedRowRef.current = moveFocusedRow;

  useAppShortcuts({
    settingsOpen,
    prompt,
    playbackActions,
    playbackStateRef,
    videoTheaterRef,
    modeTransitions,
    visibleMediaRef,
    focusedRowIdRef,
    currentMediaRef,
    moveFocusedRowRef,
    shortcutRefs: orchestration.shortcutRefs,
    addToQueue: orchestration.addToQueue,
    toggleFavorite: orchestration.toggleFavorite,
    setSettingsOpen
  });

  useEffect(() => { mediaRef.current = derived.library.media; }, [derived.library.media]);
  useEffect(() => { currentMediaRef.current = currentMedia; }, [currentMedia]);
  useEffect(() => {
    clearToasts();
  }, [clearToasts, currentMedia?.id, playerMode]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { visibleMediaRef.current = derived.visibleMedia; }, [derived.visibleMedia]);
  useEffect(() => { focusedRowIdRef.current = focusedRowId; }, [focusedRowId]);
  useEffect(() => { durationByIdRef.current = durationById; }, [durationById]);

  const sessionPlaying = isActivelyPlaying(playbackStatus);

  useDurationEnrichment({
    filteredMedia: derived.filteredMedia,
    deferredQuery,
    filter,
    sort,
    mediaLength: derived.library.media.length,
    sessionPlaying,
    durationById
  });

  useMediaSessionBridge({
    currentMedia,
    sessionPlaying,
    onTogglePlayback: orchestration.togglePlayback,
    onPrevious: orchestration.playPrevious,
    onNext: orchestration.playNext
  });

  useEffect(() => {
    if (playerMode === 'library' && isVideo) {
      playbackActions.setPreviewCollapsed(true);
    }
  }, [playerMode, isVideo, playbackActions]);

  useEffect(() => {
    if (videoTheaterOpen && isPreviewCollapsed && playerMode === 'player') {
      playbackActions.setPreviewCollapsed(false);
    }
  }, [videoTheaterOpen, isPreviewCollapsed, playbackActions, playerMode]);

  const shellLayout = useAppShellLayout({
    playerMode,
    queueLength: queue.length,
    libraryLoading,
    libraryHasMedia: libraryMediaCount > 0,
    controllerReady,
    bootError,
    isVideo,
    videoTheaterOpen,
    layoutMode,
    shell: settings.shell ?? defaultSettings.shell,
    hasCurrentTrack: Boolean(currentTrack ?? currentMedia),
    onboardingActive: settingsLoaded
      && !Boolean(bootError)
      && settings.onboarding?.welcomeCompleted !== true,
  });

  useEffect(() => {
    const pinSidebar = Boolean(settings.shell?.pinSidebar);
    setSidebarPinLocked(pinSidebar);
    if (pinSidebar) {
      setSidebarCollapsed(false);
    }
  }, [settings.shell?.pinSidebar]);

  useEffect(() => {
    if (!settings.shell?.pinSidebar) return;
    let prev = sidebarChromeStore.getState();
    return sidebarChromeStore.subscribe((state) => {
      if (state.collapsed && !prev.collapsed) {
        setSidebarCollapsed(false);
      }
      prev = state;
    });
  }, [settings.shell?.pinSidebar]);

  const handleDockEnded = useCallback(() => {
    if (playbackStateRef.current.repeat === 'one' && currentMediaRef.current) {
      void orchestration.shortcutRefs.current.playMedia(currentMediaRef.current);
      return;
    }
    orchestration.shortcutRefs.current.playNext();
  }, [orchestration.shortcutRefs]);

  useEffect(() => {
    props.onEndedRef.current = handleDockEnded;
  }, [handleDockEnded, props.onEndedRef]);

  useEffect(() => {
    const track = currentTrack;
    if (track && playbackDuration > 0) {
      shellLayout.handleDurationKnown(track.id, Math.floor(playbackDuration));
    }
  }, [playbackDuration, currentTrack?.id, shellLayout.handleDurationKnown]);

  const currentMediaId = currentMedia?.id ?? '';
  const durationSeconds = Math.max(
    currentMedia?.durationSeconds ?? 0,
    durationById[currentMediaId] ?? 0
  );

  const importFolder = useCallback(() => {
    void importLibraryFolder(showToast, translate);
  }, [showToast, t]);

  return useMemo(() => ({
    t: translate,
    settings,
    settingsLoaded,
    bootError,
    libraryLoading,
    libraryBoot,
    libraryBootError,
    libraryScanning,
    retryLibraryScan: () => retryLibraryScan(showToast, translate),
    resetLibraryIndex: () => resetLibraryIndex(showToast, translate),
    controllerReady,
    toastMessages,
    toastExitingIds,
    dragActive,
    showBootShell: shellLayout.showBootShell,
    contentClassName: shellLayout.contentClassName,
    queueDrawerOpen: shellLayout.queueDrawerOpen,
    setQueueDrawerOpen: shellLayout.setQueueDrawerOpen,
    toggleQueueDrawer: shellLayout.toggleQueueDrawer,
    queueDocked: shellLayout.queueDocked,
    centerColumnCramped: shellLayout.centerColumnCramped,
    queueDrawer: shellLayout.queueDrawer,
    showQueueToggle: shellLayout.showQueueToggle,
    shellPresentation: shellLayout.shellPresentation,
    sidebarDrawerOpen: shellLayout.sidebarDrawerOpen,
    setSidebarDrawerOpen: shellLayout.setSidebarDrawerOpen,
    playerMode,
    videoTheaterOpen,
    modeTransitions,
    filter,
    sort,
    query,
    playlists,
    activePlaylistId,
    durationById,
    currentMedia,
    sessionPlaying,
    focusedRowId,
    heroVisible: shellLayout.heroVisible,
    playError: playbackError ?? undefined,
    layoutVersion: shellLayout.layoutVersion,
    layoutMode: shellLayout.layoutMode,
    queue,
    settingsOpen,
    setSettingsOpen,
    prompt,
    setPrompt,
    durationSeconds,
    handleFilterChange: shellLayout.handleFilterChange,
    importFolder,
    selectPlaylist: orchestration.selectPlaylist,
    playPlaylist: orchestration.playPlaylist,
    dismissHero: shellLayout.dismissHero,
    playMedia: orchestration.playMedia,
    addToQueue: orchestration.addToQueue,
    addManyToQueue: orchestration.addManyToQueue,
    toggleFavorite: orchestration.toggleFavorite,
    addToPlaylistHandler: orchestration.addToPlaylistHandler,
    handleCreatePlaylist: orchestration.createPlaylist,
    handleRenamePlaylist: orchestration.renamePlaylist,
    saveSettings: orchestration.saveSettings,
    playPrevious: orchestration.playPrevious,
    playNext: orchestration.playNext,
    setRepeatMode: orchestration.setRepeatMode,
    setShuffleMode: orchestration.setShuffleMode
  }), [
    translate,
    settings,
    settingsLoaded,
    bootError,
    libraryLoading,
    libraryBoot,
    libraryBootError,
    libraryScanning,
    showToast,
    controllerReady,
    toastMessages,
    toastExitingIds,
    dragActive,
    shellLayout,
    playerMode,
    videoTheaterOpen,
    modeTransitions,
    filter,
    sort,
    query,
    playlists,
    activePlaylistId,
    durationById,
    currentMedia,
    sessionPlaying,
    focusedRowId,
    playbackError,
    queue,
    settingsOpen,
    prompt,
    durationSeconds,
    importFolder,
    orchestration,
  ]);
}

export type AppShellController = ReturnType<typeof useAppShellController>;
