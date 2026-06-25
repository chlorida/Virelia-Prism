import { WINDOW_BOUNDS_ANIM_MS } from '../../../shared/windowBoundsAnimation';

/** Native window morph duration — keep in sync with shared/windowBoundsAnimation.ts */
export const MOTION_MINI_WINDOW_MS = WINDOW_BOUNDS_ANIM_MS;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function shouldAnimateMiniWindow(explicit?: boolean): boolean {
  if (explicit === false) return false;
  if (explicit === true) return true;
  return !prefersReducedMotion();
}
