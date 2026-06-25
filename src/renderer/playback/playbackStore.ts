import type { UnifiedPlaybackState } from './playbackTypes';
import { createInitialPlaybackState } from './playbackTypes';

export type PlaybackListener = (state: UnifiedPlaybackState) => void;

const PROGRESS_KEYS: (keyof UnifiedPlaybackState)[] = [
  'currentTime',
  'bufferedEnd',
  'duration',
];

const PROGRESS_THROTTLE_MS = 250;

function isProgressOnlyPatch(partial: Partial<UnifiedPlaybackState>): boolean {
  const keys = Object.keys(partial) as (keyof UnifiedPlaybackState)[];
  if (keys.length === 0) return false;
  return keys.every((key) => PROGRESS_KEYS.includes(key));
}

export interface PlaybackStore {
  getState: () => UnifiedPlaybackState;
  patch: (partial: Partial<UnifiedPlaybackState>) => void;
  subscribe: (listener: PlaybackListener) => () => void;
}

export function createPlaybackStore(initial?: Partial<UnifiedPlaybackState>): PlaybackStore {
  let state: UnifiedPlaybackState = {
    ...createInitialPlaybackState(),
    ...initial,
  };
  const listeners = new Set<PlaybackListener>();
  let progressFlushTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let progressDirty = false;

  const notify = () => {
    for (const listener of listeners) listener(state);
  };

  const flushProgress = () => {
    progressFlushTimer = undefined;
    if (!progressDirty) return;
    progressDirty = false;
    notify();
  };

  const scheduleProgressNotify = () => {
    progressDirty = true;
    if (progressFlushTimer !== undefined) return;
    progressFlushTimer = globalThis.setTimeout(flushProgress, PROGRESS_THROTTLE_MS);
  };

  return {
    getState: () => state,
    patch: (partial) => {
      const previous = state;
      state = { ...state, ...partial };
      if (Object.is(previous, state)) return;

      if (isProgressOnlyPatch(partial)) {
        scheduleProgressNotify();
        return;
      }

      if (progressFlushTimer !== undefined) {
        globalThis.clearTimeout(progressFlushTimer);
        progressFlushTimer = undefined;
      }
      progressDirty = false;
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}
