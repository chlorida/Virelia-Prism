import { useEffect, useRef } from 'react';

import type { AppSettings, MediaItem } from '../../shared/types';

import { loadMiniPlayerMode } from '../lib/playbackPersistence';

import { runLibraryBootstrap, scheduleBackgroundLibraryRescan } from '../features/library/libraryBootstrap';
import { perfMark, perfMeasure } from '../lib/perf';
import { dumpPerfSummary } from '../lib/perfReport';

import { setLibraryLoading } from '../features/library/libraryStore';

import { isTauriShell } from '../lib/prismAdapter';

import { getPrism } from '../lib/prismApi';

import { syncMiniModeFromShell } from '../features/ui/playerModeStore';

import { startupLog } from '../lib/startupLog';

import type { LibraryScanResult } from '../../shared/types';

import type { PlaybackActions } from '../playback/usePlayback';

import { enterMiniWindow, ensureNormalWindow, exitMiniWindow } from '../lib/shellWindow';

import { playerModeStore } from '../features/ui/playerModeStore';

import { installKeyboardNavPointerReset } from '../lib/keyboardNavFocus';
import { initDownloadService } from '../features/downloads/downloadService';



export function useAppBootstrap(options: {

  setBootError: (error: string | null) => void;

  showToastRef: React.MutableRefObject<(text: string) => void>;

  tRef: React.MutableRefObject<(key: string, params?: Record<string, string | number>) => string>;

  playbackActions: PlaybackActions;

  restorePlaybackSession: (items: MediaItem[], settings: AppSettings) => Promise<void>;

  absorbLibraryScanRef: React.MutableRefObject<(result: LibraryScanResult, options?: { notify?: boolean; background?: boolean }) => Promise<void>>;

  shortcutRefs: React.MutableRefObject<{

    togglePlayback: () => void;

    playNext: () => void;

    playPrevious: () => void;

  }>;

  setSettingsOpen: (open: boolean) => void;

}) {

  const sessionRestoreStartedRef = useRef(false);

  const miniRestoreRef = useRef(false);

  const optionsRef = useRef(options);

  optionsRef.current = options;



  useEffect(() => {

    startupLog('AppShell', 'AppShell mounted');
    perfMark('app-bootstrap-start');

    const prism = getPrism();

    if (!prism) {

      optionsRef.current.setBootError(optionsRef.current.tRef.current('app.desktopApiUnavailable'));

      setLibraryLoading(false);

      return;

    }



    void runLibraryBootstrap()

      .then(({ settings: loadedSettings, libraryItems, usedCache, folders, scannedAt }) => {
        perfMeasure('app-library-bootstrap', 'app-bootstrap-start');
        dumpPerfSummary();

        optionsRef.current.playbackActions.setRepeat(loadedSettings.playback.repeat);

        optionsRef.current.playbackActions.setShuffle(loadedSettings.playback.shuffle);

        if (!sessionRestoreStartedRef.current) {
          sessionRestoreStartedRef.current = true;
          const restore = () => {
            void optionsRef.current.restorePlaybackSession(libraryItems, loadedSettings);
          };
          if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(restore, { timeout: 4000 });
          } else {
            globalThis.setTimeout(restore, 32);
          }
        }

        if (folders.length > 0) {
          scheduleBackgroundLibraryRescan(
            folders,
            (scan) => {
              void optionsRef.current.absorbLibraryScanRef.current(scan, { notify: false, background: true });
            },
            () => {
              optionsRef.current.showToastRef.current(optionsRef.current.tRef.current('toast.dropFailed'));
            },
            { usedCache, scannedAt }
          );
        }

      })

      .catch((error) => {

        console.error('[Virelia] settings/library bootstrap failed', error);

        optionsRef.current.showToastRef.current(optionsRef.current.tRef.current('error.playback'));

        optionsRef.current.setBootError(optionsRef.current.tRef.current('error.playback'));

      })

      .finally(() => setLibraryLoading(false));



    void prism.playback.status()

      .then((status) => {

        optionsRef.current.playbackActions.setRepeat(status.repeat);

        optionsRef.current.playbackActions.setShuffle(status.shuffle);

      })

      .catch(() => undefined);



    if (loadMiniPlayerMode() && !miniRestoreRef.current) {

      miniRestoreRef.current = true;

      void enterMiniWindow({ animate: false });

    } else {

      void ensureNormalWindow('startup');

    }



    const removeNativeShortcut = prism.onShortcut((shortcut) => {

      if (shortcut === 'globalSearch') document.querySelector<HTMLInputElement>('.search-box input')?.focus();

      if (shortcut === 'settings') optionsRef.current.setSettingsOpen(true);

      if (shortcut === 'miniPlayer') {

        if (playerModeStore.getState().mode === 'mini') {

          void exitMiniWindow('restore');

        } else {

          void enterMiniWindow({ animate: false });

        }

      }

      if (shortcut === 'playPause') void optionsRef.current.shortcutRefs.current.togglePlayback();

      if (shortcut === 'previous') void optionsRef.current.shortcutRefs.current.playPrevious();

      if (shortcut === 'next') void optionsRef.current.shortcutRefs.current.playNext();

    });



    const removeLibraryListener = prism.onLibraryUpdated((scan) => {
      void optionsRef.current.absorbLibraryScanRef.current(scan, {
        notify: !isTauriShell(),
        background: true,
      });
    });



    const removeMiniListener = prism.onMiniPlayer((active) => {

      syncMiniModeFromShell(active);

      if (!active) void ensureNormalWindow('mini-player-inactive');

    });



    const removeKeyboardNavReset = installKeyboardNavPointerReset();

    void initDownloadService();



    return () => {

      removeNativeShortcut();

      removeLibraryListener();

      removeMiniListener();

      removeKeyboardNavReset();

    };

  }, []);

}

