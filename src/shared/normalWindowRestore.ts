import {
  clampBoundsToWorkArea,
  getFallbackNormalBounds,
  validateNormalBounds
} from './normalBoundsValidation';
import {
  isMiniLikeBounds,
  isValidNormalBounds,
  type WindowBounds,
  type WorkAreaRect
} from './miniWindowGeometry';

export interface SavedNormalWindowState {
  bounds?: WindowBounds;
  wasMaximized: boolean;
  wasFullScreen: boolean;
  savedAt: number;
}

export function createSavedNormalWindowState(): SavedNormalWindowState {
  return { wasMaximized: false, wasFullScreen: false, savedAt: 0 };
}

/** Whether to persist x/y/width/height (not when maximized/fullscreen — restore uses flags). */
export function shouldPersistNormalBounds(wasMaximized: boolean, wasFullScreen: boolean): boolean {
  return !wasMaximized && !wasFullScreen;
}

export function captureBoundsCandidate(
  bounds: WindowBounds,
  wasMaximized: boolean,
  wasFullScreen: boolean,
  workArea?: WorkAreaRect
): WindowBounds | undefined {
  if (!shouldPersistNormalBounds(wasMaximized, wasFullScreen)) return undefined;
  if (!isValidNormalBounds(bounds) || isMiniLikeBounds(bounds)) return undefined;
  if (workArea && !validateNormalBounds(bounds, workArea)) return undefined;
  return { ...bounds };
}

export function resolveCenteredFallback(workArea: WorkAreaRect): WindowBounds {
  return getFallbackNormalBounds(workArea);
}

/** Bounds to apply on restore, or null when restore should use maximize/fullscreen only. */
export function pickRestoreBounds(
  saved: SavedNormalWindowState,
  workArea: WorkAreaRect
): WindowBounds | null {
  if (saved.wasMaximized || saved.wasFullScreen) return null;
  const candidate = saved.bounds;
  if (candidate && validateNormalBounds(candidate, workArea)) {
    return clampBoundsToWorkArea(candidate, workArea);
  }
  return getFallbackNormalBounds(workArea);
}
