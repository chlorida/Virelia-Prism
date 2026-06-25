import { createContext, useContext } from 'react';
import type { MediaItem } from '../../shared/types';
import type { MediaController, LoadTrackOptions } from './mediaController';
import type { PlaybackStore } from './playbackStore';
import type { UnifiedPlaybackState } from './playbackTypes';
import { useStore } from '../lib/useStore';

export interface PlaybackActions {
  whenReady: () => Promise<void>;
  loadTrack: (track: MediaItem, options?: LoadTrackOptions) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => Promise<void>;
  setVolume: (value: number) => void;
  setMuted: (muted: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  stop: () => void;
  enterFullscreen: (target?: HTMLElement) => void;
  exitFullscreen: () => void;
  setPreviewCollapsed: (collapsed: boolean) => void;
  setRepeat: (repeat: import('../../shared/types').RepeatMode) => void;
  setShuffle: (shuffle: boolean) => void;
  attachPreviewHost: (host: HTMLElement | null) => void;
  getElement: () => HTMLVideoElement | null;
}

export interface PlaybackContextValue {
  actions: PlaybackActions;
  controllerReady: boolean;
}

export const PlaybackContext = createContext<PlaybackContextValue | null>(null);
export const PlaybackStoreContext = createContext<PlaybackStore | null>(null);

export function usePlaybackActions(): PlaybackContextValue {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error('usePlaybackActions must be used within PlaybackProvider');
  return ctx;
}

/** Actions + readiness; state updates are throttled (~4 Hz) during playback progress. */
export function usePlayback(): PlaybackContextValue & { state: UnifiedPlaybackState } {
  const ctx = usePlaybackActions();
  const state = usePlaybackSelector((s) => s);
  return { ...ctx, state };
}

export function usePlaybackState(): UnifiedPlaybackState {
  return usePlaybackSelector((s) => s);
}

export function usePlaybackStore(): PlaybackStore {
  const store = useContext(PlaybackStoreContext);
  if (!store) throw new Error('usePlaybackStore must be used within PlaybackProvider');
  return store;
}

/** Subscribe to a slice of playback state (skips high-frequency progress fields by default). */
export function usePlaybackSelector<T>(selector: (state: UnifiedPlaybackState) => T): T {
  const store = usePlaybackStore();
  return useStore(store as import('../lib/createStore').PrismStore<UnifiedPlaybackState>, selector);
}
