import { useCallback, useRef } from 'react';
import { usePlaybackActions, usePlaybackSelector } from '../../playback/usePlayback';
import {
  enterLibraryMode,
  enterPlayerMode,
  playerModeStore,
  setVideoTheater,
  toggleVideoTheater
} from './playerModeStore';

import { useStore } from '../../lib/useStore';
import { enterMiniWindow, exitMiniWindow } from '../../lib/shellWindow';
import { perfTransitions } from '../../lib/perfTransitions';
import { shouldAnimateMiniWindow } from '../mini/miniShellTransition';
import { getExpectedMiniDimensions, NORMAL_WINDOW_FALLBACK } from '../../../shared/miniWindowGeometry';
import {
  beginMiniMorph,
  captureViewportSize,
  endMiniMorph,
} from '../mini/useMiniMorphCompensation';
import { miniShellTransitionStore, shouldUseViewportMorph } from '../mini/miniShellTransitionStore';
import { readWindowChromeState, usesChromeRestoreFlags } from '../../lib/windowChromeState';
import type { ExitMiniTarget } from '../../lib/shellWindow';

/**
 * Layout/view transitions (library, video-watch, theater) must NOT change OS window
 * geometry. Only mini enter/exit and native fullscreen touch the shell window.
 */
export function usePlayerModeTransitions() {
  const { actions } = usePlaybackActions();
  const isVideo = usePlaybackSelector((s) => s.isVideo);
  const isPreviewCollapsed = usePlaybackSelector((s) => s.isPreviewCollapsed);
  const mode = useStore(playerModeStore, (s) => s.mode);
  const videoTheater = useStore(playerModeStore, (s) => s.videoTheater);
  const miniTransitionBusy = useStore(miniShellTransitionStore, (s) => s.busy);
  const watchEnterMark = useRef<string | null>(null);
  const watchExitMark = useRef<string | null>(null);
  const theaterMark = useRef<string | null>(null);

  const enterLibrary = useCallback(() => {
    watchExitMark.current = perfTransitions.watchExitStart();
    enterLibraryMode();
    actions.attachPreviewHost(null);
    if (isVideo) actions.setPreviewCollapsed(true);
    if (watchExitMark.current) {
      perfTransitions.watchExitEnd(watchExitMark.current);
      watchExitMark.current = null;
    }
  }, [actions, isVideo]);

  /** Video watch layout — renderer only; does not resize or move the native window. */
  const enterPlayer = useCallback(() => {
    if (!isVideo) return;

    watchEnterMark.current = perfTransitions.watchEnterStart();
    enterPlayerMode();
    actions.setPreviewCollapsed(false);
    if (watchEnterMark.current) {
      perfTransitions.watchEnterEnd(watchEnterMark.current);
      watchEnterMark.current = null;
    }
  }, [actions, isVideo]);

  const runExitMini = useCallback(async (target: ExitMiniTarget) => {
    const animate = shouldAnimateMiniWindow();
    const useMorph = animate && shouldUseViewportMorph();
    try {
      if (useMorph) {
        const from = captureViewportSize();
        const restore = miniShellTransitionStore.getState().restoreViewport;
        const to = restore ?? {
          width: NORMAL_WINDOW_FALLBACK.width,
          height: NORMAL_WINDOW_FALLBACK.height,
        };
        beginMiniMorph('from-mini', from, to);
      }
      await exitMiniWindow(target, { animate: useMorph });
    } finally {
      endMiniMorph();
    }
  }, []);

  const enterMini = useCallback(() => {
    if (miniShellTransitionStore.getState().busy) return;

    const mark = perfTransitions.miniEnterStart();
    const animate = shouldAnimateMiniWindow();

    void (async () => {
      try {
        const chrome = await readWindowChromeState();
        const useMorph = animate && !usesChromeRestoreFlags(chrome);
        if (useMorph) {
          const from = captureViewportSize();
          const to = getExpectedMiniDimensions(isVideo ? 'video' : 'audio');
          beginMiniMorph('to-mini', from, to);
        }
        await enterMiniWindow({ isVideo, animate: useMorph });
      } finally {
        endMiniMorph();
        perfTransitions.miniEnterEnd(mark);
      }
    })();
  }, [isVideo]);

  const restoreMini = useCallback(() => {
    if (miniShellTransitionStore.getState().busy) return;

    const mark = perfTransitions.miniExitStart();
    void runExitMini('restore').finally(() => perfTransitions.miniExitEnd(mark));
  }, [runExitMini]);

  const closeMiniToLibrary = useCallback(() => {
    if (miniShellTransitionStore.getState().busy) return;

    const mark = perfTransitions.miniExitStart();
    void runExitMini('library').finally(() => perfTransitions.miniExitEnd(mark));
  }, [runExitMini]);

  const toggleMini = useCallback(() => {
    if (miniShellTransitionStore.getState().busy) return;
    if (playerModeStore.getState().mode === 'mini') restoreMini();
    else enterMini();
  }, [enterMini, restoreMini]);

  const onVideoTheater = useCallback(() => {
    if (!isVideo) return;

    const opening = !videoTheater;
    theaterMark.current = opening
      ? perfTransitions.theaterEnterStart()
      : perfTransitions.theaterExitStart();

    if (mode !== 'player') {
      enterPlayerMode();
    }
    toggleVideoTheater();
    if (!videoTheater && isPreviewCollapsed) {
      actions.setPreviewCollapsed(false);
    }
    if (theaterMark.current) {
      if (opening) perfTransitions.theaterEnterEnd(theaterMark.current);
      else perfTransitions.theaterExitEnd(theaterMark.current);
      theaterMark.current = null;
    }
  }, [actions, isPreviewCollapsed, isVideo, mode, videoTheater]);

  const exitVideoTheater = useCallback(() => {
    const mark = perfTransitions.theaterExitStart();
    setVideoTheater(false);
    perfTransitions.theaterExitEnd(mark);
  }, []);

  return {
    mode,
    videoTheater,
    miniTransitionBusy,
    enterLibrary,
    enterPlayer,
    enterMini,
    exitMini: restoreMini,
    restoreMini,
    closeMiniToLibrary,
    toggleMini,
    onVideoTheater,
    exitVideoTheater
  };
}
