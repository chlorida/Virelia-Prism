import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { isVideoFullscreenActive, subscribeVideoFullscreen } from '../../lib/domFullscreen';
import { isActivelyPlaying } from '../../playback/playbackTypes';
import { usePlaybackActions, usePlaybackSelector } from '../../playback/usePlayback';
import { useOptionalAppShell } from '../../app/AppShellContext';
import { PLAYBACK_SPEEDS } from './SpeedMenu';
import { isHotkeyBlockedTarget, isPlayerContextActive, isVideoInteractiveTarget } from './videoPlayerInteraction';

const HIDE_DELAY_MS = 2500;
const LEAVE_DELAY_MS = 800;

export function useVideoPlayerChrome(surfaceRef: RefObject<HTMLElement | null>) {
  const shell = useOptionalAppShell();
  const { actions } = usePlaybackActions();
  const playbackStatus = usePlaybackSelector((s) => s.playbackStatus);
  const currentTime = usePlaybackSelector((s) => s.currentTime);
  const duration = usePlaybackSelector((s) => s.duration);
  const muted = usePlaybackSelector((s) => s.muted);
  const volume = usePlaybackSelector((s) => s.volume);
  const playbackRate = usePlaybackSelector((s) => s.playbackRate);

  const hotkeyStateRef = useRef({ currentTime, duration, muted, volume, playbackRate });
  hotkeyStateRef.current = { currentTime, duration, muted, volume, playbackRate };

  const [controlsVisible, setControlsVisible] = useState(true);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [pointerOverControls, setPointerOverControls] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | undefined>(undefined);

  const playing = isActivelyPlaying(playbackStatus);
  const loading = playbackStatus === 'loading';
  const paused = playbackStatus === 'paused' || playbackStatus === 'ended';
  const menuOpen = speedMenuOpen;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) globalThis.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = undefined;
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    clearHideTimer();
    if (playing && !menuOpen && !pointerOverControls) {
      hideTimerRef.current = globalThis.setTimeout(() => {
        setControlsVisible(false);
      }, HIDE_DELAY_MS);
    }
  }, [playing, menuOpen, pointerOverControls, clearHideTimer]);

  useEffect(() => {
    if (!playing || paused || loading || menuOpen) {
      setControlsVisible(true);
      clearHideTimer();
      return;
    }
    revealControls();
  }, [playing, paused, loading, menuOpen, revealControls, clearHideTimer]);

  useEffect(() => {
    const sync = () => setIsFullscreen(isVideoFullscreenActive(surfaceRef.current));
    sync();
    const unsub = subscribeVideoFullscreen(sync);
    return unsub;
  }, [surfaceRef]);

  useEffect(() => () => {
    clearHideTimer();
  }, [clearHideTimer]);

  const showControls = controlsVisible || !playing || paused || loading || menuOpen
    || playbackStatus === 'error';

  const idleCursor = playing && !showControls && pointerInside;

  const handleSurfacePointerEnter = useCallback(() => {
    setPointerInside(true);
    revealControls();
  }, [revealControls]);

  const handleSurfacePointerMove = useCallback(() => {
    setPointerInside(true);
    revealControls();
  }, [revealControls]);

  const handleSurfacePointerLeave = useCallback(() => {
    setPointerInside(false);
    if (playing && !menuOpen) {
      clearHideTimer();
      hideTimerRef.current = globalThis.setTimeout(() => {
        setControlsVisible(false);
      }, LEAVE_DELAY_MS);
    }
  }, [playing, menuOpen, clearHideTimer]);

  const handleControlsPointerEnter = useCallback(() => {
    setPointerOverControls(true);
    clearHideTimer();
    setControlsVisible(true);
  }, [clearHideTimer]);

  const handleControlsPointerLeave = useCallback(() => {
    setPointerOverControls(false);
    revealControls();
  }, [revealControls]);

  const handleSurfaceClick = useCallback((event: React.MouseEvent) => {
    if (isVideoInteractiveTarget(event.target)) return;
    actions.togglePlay();
  }, [actions]);

  const handleSurfaceDoubleClick = useCallback((event: React.MouseEvent) => {
    if (isVideoInteractiveTarget(event.target)) return;
    event.preventDefault();
    const surface = surfaceRef.current;
    if (!surface) return;
    actions.enterFullscreen(surface);
  }, [actions, surfaceRef]);

  const revealControlsRef = useRef(revealControls);
  revealControlsRef.current = revealControls;
  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;
  const shellRef = useRef(shell);
  shellRef.current = shell;

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isHotkeyBlockedTarget(event.target)) return;
      if (!isPlayerContextActive(surface)) return;

      const state = hotkeyStateRef.current;
      const key = event.key.toLowerCase();

      if (event.code === 'Space' || key === 'k') {
        event.preventDefault();
        actions.togglePlay();
        revealControlsRef.current();
        return;
      }
      if (key === 'j') {
        event.preventDefault();
        void actions.seek(Math.max(0, state.currentTime - 10));
        revealControlsRef.current();
        return;
      }
      if (key === 'l') {
        event.preventDefault();
        void actions.seek(state.currentTime + 10);
        revealControlsRef.current();
        return;
      }
      if (event.code === 'ArrowLeft') {
        event.preventDefault();
        void actions.seek(Math.max(0, state.currentTime - 5));
        revealControlsRef.current();
        return;
      }
      if (event.code === 'ArrowRight') {
        event.preventDefault();
        void actions.seek(state.currentTime + 5);
        revealControlsRef.current();
        return;
      }
      if (event.code === 'ArrowUp') {
        event.preventDefault();
        actions.setVolume(Math.min(1, state.volume + 0.05));
        revealControlsRef.current();
        return;
      }
      if (event.code === 'ArrowDown') {
        event.preventDefault();
        actions.setVolume(Math.max(0, state.volume - 0.05));
        revealControlsRef.current();
        return;
      }
      if (key === 'm') {
        event.preventDefault();
        actions.setMuted(!state.muted);
        revealControlsRef.current();
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        actions.enterFullscreen(surface);
        return;
      }
      if (key === 't' && shellRef.current?.modeTransitions.onVideoTheater) {
        event.preventDefault();
        shellRef.current.modeTransitions.onVideoTheater();
        revealControlsRef.current();
        return;
      }
      if (key === '<' || key === ',') {
        event.preventDefault();
        const idx = PLAYBACK_SPEEDS.findIndex((s) => s >= state.playbackRate);
        const next = PLAYBACK_SPEEDS[Math.max(0, idx - 1)] ?? 1;
        actions.setPlaybackRate(next);
        revealControlsRef.current();
        return;
      }
      if (key === '>' || key === '.') {
        event.preventDefault();
        const idx = PLAYBACK_SPEEDS.findIndex((s) => s >= state.playbackRate);
        const next = PLAYBACK_SPEEDS[Math.min(PLAYBACK_SPEEDS.length - 1, idx + 1)] ?? 1;
        actions.setPlaybackRate(next);
        revealControlsRef.current();
        return;
      }
      if (key >= '0' && key <= '9') {
        event.preventDefault();
        const pct = Number(key) / 10;
        const dur = Math.max(state.duration, 0);
        if (dur > 0) void actions.seek(dur * pct);
        revealControlsRef.current();
        return;
      }
      if (event.code === 'Escape') {
        if (menuOpenRef.current) {
          setSpeedMenuOpen(false);
          return;
        }
        if (isVideoFullscreenActive(surface)) {
          actions.exitFullscreen();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, surfaceRef]);

  return {
    playing,
    loading,
    paused,
    showControls,
    idleCursor,
    isFullscreen,
    speedMenuOpen,
    setSpeedMenuOpen,
    revealControls,
    handleSurfacePointerEnter,
    handleSurfacePointerMove,
    handleSurfacePointerLeave,
    handleControlsPointerEnter,
    handleControlsPointerLeave,
    handleSurfaceClick,
    handleSurfaceDoubleClick,
  };
}
