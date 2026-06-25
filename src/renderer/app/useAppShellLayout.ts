import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readStored, STORAGE_KEYS } from '../lib/storageKeys';
import { sidebarChromeStore } from '../features/ui/sidebarChromeStore';
import { useStore } from '../lib/useStore';
import { useAppLayoutMode } from '../hooks/useAppLayoutMode';
import { isQueueDocked } from '../features/ui/queueLayout';
import { setActivePlaylistId } from '../features/queue/queueStore';
import { setLibraryFilter, setDurationForMedia } from '../features/library/libraryStore';
import { resolveShellPresentation } from './shellPolicy';
import type { ShellSettings } from './shellChromeTypes';
import type { MediaFilter } from '../../shared/types';
import type { PlayerMode } from '../features/ui/playerModeTypes';

/** When the center column is narrower than this, docked right panel becomes a drawer. */
export const CENTER_COLUMN_MIN_WIDTH = 780;
const CENTER_COLUMN_UNCRAMPED_WIDTH = 820;

export function useAppShellLayout(options: {
  playerMode: PlayerMode;
  queueLength: number;
  libraryLoading: boolean;
  libraryHasMedia: boolean;
  controllerReady: boolean;
  bootError: string | null;
  isVideo: boolean;
  videoTheaterOpen: boolean;
  layoutMode: ReturnType<typeof useAppLayoutMode>;
  shell: ShellSettings;
  hasCurrentTrack: boolean;
  onboardingActive: boolean;
}) {
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [centerColumnCramped, setCenterColumnCramped] = useState(false);
  const [heroVisible, setHeroVisible] = useState(() => !readStored(STORAGE_KEYS.heroDismissed, false));
  const sidebarCollapsed = useStore(sidebarChromeStore, (state) => state.collapsed);
  const rightPanelTabs = useStore(sidebarChromeStore, (state) => state.rightPanelTabs);
  const layoutMode = options.layoutMode;
  const queueDockedByWidth = isQueueDocked(layoutMode);

  useEffect(() => {
    if (queueDockedByWidth) {
      setQueueDrawerOpen(false);
      setSidebarDrawerOpen(false);
    }
  }, [queueDockedByWidth]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setQueueDrawerOpen(false);
      setSidebarDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const measureCenter = () => {
      const host = document.querySelector<HTMLElement>('.media-list-host');
      const width = host?.clientWidth ?? 0;
      if (width <= 0) return;

      setCenterColumnCramped((prev) => {
        if (prev) return width < CENTER_COLUMN_UNCRAMPED_WIDTH;
        return width < CENTER_COLUMN_MIN_WIDTH;
      });
    };

    measureCenter();
    const host = document.querySelector<HTMLElement>('.media-list-host');
    if (host && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measureCenter);
      observer.observe(host);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', measureCenter);
    return () => window.removeEventListener('resize', measureCenter);
  }, [options.layoutMode, options.playerMode]);

  useEffect(() => {
    if (options.playerMode === 'mini') return;

    const PLAYBACK_BAR_MIN_PX = 72;
    const PLAYBACK_BAR_FALLBACK = 'var(--playback-bar-estimate, 100px)';
    let disposed = false;
    let observer: ResizeObserver | null = null;
    const retryTimers: number[] = [];

    const findFrame = () => document.querySelector<HTMLElement>('.app-frame:not(.app-frame--mini-shell)');
    const findBar = () => document.querySelector<HTMLElement>('.app-frame:not(.app-frame--mini-shell) .app-player .playback-bar');

    const applyHeight = (bar: HTMLElement) => {
      const heightPx = Math.max(Math.ceil(bar.getBoundingClientRect().height), PLAYBACK_BAR_MIN_PX);
      const height = `${heightPx}px`;
      const frame = findFrame();
      document.documentElement.style.setProperty('--bottom-player-height', height);
      document.documentElement.style.setProperty('--player-height', height);
      document.documentElement.style.setProperty('--playback-bar-height', height);
      frame?.style.setProperty('--bottom-player-height', height);
      frame?.style.setProperty('--player-height', height);
    };

    const applyFallback = () => {
      const frame = findFrame();
      document.documentElement.style.setProperty('--bottom-player-height', PLAYBACK_BAR_FALLBACK);
      document.documentElement.style.setProperty('--player-height', PLAYBACK_BAR_FALLBACK);
      document.documentElement.style.setProperty('--playback-bar-height', PLAYBACK_BAR_FALLBACK);
      frame?.style.setProperty('--bottom-player-height', PLAYBACK_BAR_FALLBACK);
      frame?.style.setProperty('--player-height', PLAYBACK_BAR_FALLBACK);
    };

    const attach = () => {
      if (disposed) return false;
      const bar = findBar();
      if (!bar) {
        applyFallback();
        return false;
      }

      const scheduleMeasure = () => {
        if (!disposed) applyHeight(bar);
      };

      scheduleMeasure();
      requestAnimationFrame(scheduleMeasure);
      observer?.disconnect();
      observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMeasure) : null;
      observer?.observe(bar);
      return true;
    };

    const remeasure = () => {
      if (!attach()) {
        applyFallback();
      }
    };

    remeasure();
    [16, 50, 120, 280, 450, 700].forEach((delayMs) => {
      retryTimers.push(window.setTimeout(remeasure, delayMs));
    });

    window.addEventListener('resize', remeasure);
    window.addEventListener('focus', remeasure);
    window.addEventListener('prism:shell-restored', remeasure);

    return () => {
      disposed = true;
      observer?.disconnect();
      retryTimers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('focus', remeasure);
      window.removeEventListener('prism:shell-restored', remeasure);
    };
  }, [options.playerMode, options.isVideo, options.videoTheaterOpen, centerColumnCramped]);

  const shellPresentation = useMemo(
    () => resolveShellPresentation({
      layoutMode,
      centerColumnCramped,
      playerMode: options.playerMode,
      shell: options.shell,
      sidebarCollapsed,
      sidebarDrawerOpen,
      queueDrawerOpen,
      rightPanelTabs,
      hasCurrentTrack: options.hasCurrentTrack,
      queueLength: options.queueLength,
      onboardingActive: options.onboardingActive,
      videoTheaterOpen: options.videoTheaterOpen,
    }),
    [
      layoutMode,
      centerColumnCramped,
      options.playerMode,
      options.shell,
      sidebarCollapsed,
      sidebarDrawerOpen,
      queueDrawerOpen,
      rightPanelTabs,
      options.hasCurrentTrack,
      options.queueLength,
      options.onboardingActive,
      options.videoTheaterOpen,
    ],
  );

  const { effectiveQueueDocked } = shellPresentation;
  const wasQueueDockedRef = useRef(effectiveQueueDocked);

  useEffect(() => {
    if (wasQueueDockedRef.current && !effectiveQueueDocked) {
      setQueueDrawerOpen(true);
    }
    wasQueueDockedRef.current = effectiveQueueDocked;
  }, [effectiveQueueDocked]);

  const layoutVersion = `${layoutMode}-${centerColumnCramped}-${queueDrawerOpen}-${sidebarDrawerOpen}-${options.isVideo}-${options.playerMode}-${options.videoTheaterOpen}-${shellPresentation.rightPanel}`;
  const showBootShell = Boolean(options.bootError);
  const contentClassName = [
    ...shellPresentation.contentClasses,
    showBootShell ? 'app-content--booting' : '',
  ].filter(Boolean).join(' ');

  const handleFilterChange = useCallback((next: MediaFilter) => {
    setActivePlaylistId(null);
    setLibraryFilter(next);
  }, []);

  const dismissHero = useCallback(() => {
    setHeroVisible(false);
    localStorage.setItem(STORAGE_KEYS.heroDismissed, 'true');
  }, []);

  const handleDurationKnown = useCallback((mediaId: string, duration: number) => {
    setDurationForMedia(mediaId, duration);
  }, []);

  const toggleQueueDrawer = useCallback(() => {
    setQueueDrawerOpen((open) => !open);
  }, []);

  return {
    queueDrawerOpen,
    setQueueDrawerOpen,
    toggleQueueDrawer,
    sidebarDrawerOpen,
    setSidebarDrawerOpen,
    heroVisible,
    dismissHero,
    layoutVersion,
    layoutMode,
    queueDocked: effectiveQueueDocked,
    queueDrawer: !effectiveQueueDocked,
    showQueueToggle: shellPresentation.showQueueToggle,
    centerColumnCramped,
    effectiveQueueDocked,
    shellPresentation,
    contentClassName,
    showBootShell,
    handleFilterChange,
    handleDurationKnown,
  };
}
