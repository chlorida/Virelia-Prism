import { useEffect, useRef, type RefObject } from 'react';
import {
  WINDOW_BOUNDS_ANIM_MS,
  easeOutCubic,
} from '../../../shared/windowBoundsAnimation';
import {
  miniShellTransitionStore,
  type MiniShellTransitionState,
} from './miniShellTransitionStore';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Keeps mini morph visually smooth at display refresh rate (Tauri WebView rAF).
 * Covers gaps when native setSize/setPosition IPC lags behind the eased timeline.
 */
export function useMiniMorphCompensation(
  morphFrom: MiniShellTransitionState['morphFrom'],
  morphTo: MiniShellTransitionState['morphTo'],
  morphStartedAt: MiniShellTransitionState['morphStartedAt'],
  direction: MiniShellTransitionState['direction'],
  phase: MiniShellTransitionState['phase'],
  restoreWasMaximized: boolean,
  restoreWasFullScreen: boolean,
): RefObject<HTMLDivElement | null> {
  const compensateRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = compensateRef.current;
    if (!root || phase !== 'animating' || !morphFrom || !morphTo || !direction) {
      if (root) {
        root.style.transform = '';
        root.style.willChange = '';
      }
      return;
    }

    if (restoreWasMaximized || restoreWasFullScreen) {
      root.style.transform = '';
      root.style.willChange = '';
      return;
    }

    const start = morphStartedAt ?? performance.now();
    const duration = WINDOW_BOUNDS_ANIM_MS;
    const originX = '100%';
    const originY = '100%';
    let frameId = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);

      const expectW = lerp(morphFrom.width, morphTo.width, eased);
      const expectH = lerp(morphFrom.height, morphTo.height, eased);
      const actualW = window.innerWidth;
      const actualH = window.innerHeight;

      const scaleX = actualW > 0 ? clamp(expectW / actualW, 0.72, 1.28) : 1;
      const scaleY = actualH > 0 ? clamp(expectH / actualH, 0.72, 1.28) : 1;

      root.style.transformOrigin = `${originX} ${originY}`;
      root.style.willChange = 'transform';
      root.style.transform = `scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`;

      if (t < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        root.style.transform = '';
        root.style.willChange = '';
      }
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      root.style.transform = '';
      root.style.willChange = '';
    };
  }, [direction, morphFrom, morphStartedAt, morphTo, phase, restoreWasFullScreen, restoreWasMaximized]);

  return compensateRef;
}

export function captureViewportSize(): { width: number; height: number } {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function beginMiniMorph(
  direction: 'to-mini' | 'from-mini',
  morphFrom: { width: number; height: number },
  morphTo: { width: number; height: number },
): void {
  miniShellTransitionStore.patch({
    phase: 'animating',
    direction,
    busy: true,
    morphFrom,
    morphTo,
    morphStartedAt: performance.now(),
  });
}

export function endMiniMorph(): void {
  miniShellTransitionStore.patch({
    phase: 'idle',
    direction: null,
    busy: false,
    morphFrom: null,
    morphTo: null,
    morphStartedAt: null,
  });
}
