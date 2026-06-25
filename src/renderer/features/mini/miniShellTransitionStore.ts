import { createStore } from '../../lib/createStore';

export type MiniShellTransitionPhase = 'idle' | 'animating';
export type MiniShellTransitionDirection = 'to-mini' | 'from-mini' | null;

export interface MorphViewportSize {
  width: number;
  height: number;
}

export interface MiniShellTransitionState {
  phase: MiniShellTransitionPhase;
  direction: MiniShellTransitionDirection;
  busy: boolean;
  morphFrom: MorphViewportSize | null;
  morphTo: MorphViewportSize | null;
  morphStartedAt: number | null;
  restoreViewport: MorphViewportSize | null;
  restoreWasMaximized: boolean;
  restoreWasFullScreen: boolean;
  /** Hides mini chrome while OS fullscreen restore rect is being corrected. */
  suppressMiniChrome: boolean;
}

export const miniShellTransitionStore = createStore<MiniShellTransitionState>({
  phase: 'idle',
  direction: null,
  busy: false,
  morphFrom: null,
  morphTo: null,
  morphStartedAt: null,
  restoreViewport: null,
  restoreWasMaximized: false,
  restoreWasFullScreen: false,
  suppressMiniChrome: false,
});

export function setMiniShellTransition(
  phase: MiniShellTransitionPhase,
  direction: MiniShellTransitionDirection = null,
  morph?: {
    from?: MorphViewportSize | null;
    to?: MorphViewportSize | null;
    restoreViewport?: MorphViewportSize | null;
  }
): void {
  const prev = miniShellTransitionStore.getState();
  miniShellTransitionStore.patch({
    phase,
    direction,
    busy: phase !== 'idle',
    morphFrom: morph?.from ?? (phase === 'idle' ? null : prev.morphFrom),
    morphTo: morph?.to ?? (phase === 'idle' ? null : prev.morphTo),
    morphStartedAt: phase === 'animating' ? performance.now() : null,
    restoreViewport: morph?.restoreViewport ?? prev.restoreViewport,
  });
}

export function shouldUseViewportMorph(): boolean {
  const { restoreWasMaximized, restoreWasFullScreen } = miniShellTransitionStore.getState();
  return !restoreWasMaximized && !restoreWasFullScreen;
}

export function resetMiniTransition(): void {
  miniShellTransitionStore.patch({
    phase: 'idle',
    direction: null,
    busy: false,
    morphFrom: null,
    morphTo: null,
    morphStartedAt: null,
    restoreWasMaximized: false,
    restoreWasFullScreen: false,
    suppressMiniChrome: false,
  });
}
