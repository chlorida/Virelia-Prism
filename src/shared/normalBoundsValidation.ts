import {
  isMiniLikeBounds,
  type WindowBounds,
  type WorkAreaRect
} from './miniWindowGeometry';
import { APP_SHELL_MIN_HEIGHT, APP_SHELL_MIN_WIDTH } from './appShellConstraints';
import { logWindowState } from './windowStateDebug';

export const NORMAL_BOUNDS_MIN_WIDTH = APP_SHELL_MIN_WIDTH;
export const NORMAL_BOUNDS_MIN_HEIGHT = APP_SHELL_MIN_HEIGHT;
export const NORMAL_BOUNDS_MAX_WIDTH = 5000;
export const NORMAL_BOUNDS_MAX_HEIGHT = 3000;
/** Mini-sized footprint rejected as normal (width & height). */
export const MINI_FOOTPRINT_MAX_WIDTH = 520;
export const MINI_FOOTPRINT_MAX_HEIGHT = 340;
export const WORK_AREA_EDGE_TOLERANCE = 8;
export const WORK_AREA_CLAMP_MARGIN = 20;

export function validateNormalBounds(bounds: WindowBounds, workArea: WorkAreaRect): boolean {
  if (
    !Number.isFinite(bounds.x)
    || !Number.isFinite(bounds.y)
    || !Number.isFinite(bounds.width)
    || !Number.isFinite(bounds.height)
  ) {
    return false;
  }

  if (
    bounds.width < NORMAL_BOUNDS_MIN_WIDTH
    || bounds.height < NORMAL_BOUNDS_MIN_HEIGHT
    || bounds.width > NORMAL_BOUNDS_MAX_WIDTH
    || bounds.height > NORMAL_BOUNDS_MAX_HEIGHT
  ) {
    return false;
  }

  if (bounds.width <= MINI_FOOTPRINT_MAX_WIDTH && bounds.height <= MINI_FOOTPRINT_MAX_HEIGHT) {
    return false;
  }

  if (isMiniLikeBounds(bounds)) {
    return false;
  }

  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const workRight = workArea.x + workArea.width;
  const workBottom = workArea.y + workArea.height;

  if (bounds.x < workArea.x - WORK_AREA_EDGE_TOLERANCE) return false;
  if (bounds.y < workArea.y - WORK_AREA_EDGE_TOLERANCE) return false;
  if (right > workRight + WORK_AREA_EDGE_TOLERANCE) return false;
  if (bottom > workBottom + WORK_AREA_EDGE_TOLERANCE) return false;

  return true;
}

export function clampBoundsToWorkArea(bounds: WindowBounds, workArea: WorkAreaRect): WindowBounds {
  const width = Math.min(bounds.width, Math.max(NORMAL_BOUNDS_MIN_WIDTH, workArea.width - WORK_AREA_CLAMP_MARGIN * 2));
  const height = Math.min(bounds.height, Math.max(NORMAL_BOUNDS_MIN_HEIGHT, workArea.height - WORK_AREA_CLAMP_MARGIN * 2));
  const minX = workArea.x + WORK_AREA_CLAMP_MARGIN;
  const minY = workArea.y + WORK_AREA_CLAMP_MARGIN;
  const maxX = workArea.x + workArea.width - width - WORK_AREA_CLAMP_MARGIN;
  const maxY = workArea.y + workArea.height - height - WORK_AREA_CLAMP_MARGIN;

  return {
    width,
    height,
    x: Math.round(Math.max(minX, Math.min(maxX, bounds.x))),
    y: Math.round(Math.max(minY, Math.min(maxY, bounds.y)))
  };
}

export function getFallbackNormalBounds(workArea: WorkAreaRect): WindowBounds {
  const width = Math.min(1280, Math.max(NORMAL_BOUNDS_MIN_WIDTH, workArea.width - 80));
  const height = Math.min(800, Math.max(NORMAL_BOUNDS_MIN_HEIGHT, workArea.height - 80));
  return {
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2)
  };
}

export interface PickTargetNormalResult {
  bounds: WindowBounds;
  usedFallback: boolean;
  source: 'savedNormal' | 'lastGood' | 'fallback';
}

export function pickTargetNormalBounds(
  workArea: WorkAreaRect,
  savedNormal?: WindowBounds,
  lastGood?: WindowBounds
): PickTargetNormalResult {
  if (savedNormal && validateNormalBounds(savedNormal, workArea)) {
    return {
      bounds: clampBoundsToWorkArea(savedNormal, workArea),
      usedFallback: false,
      source: 'savedNormal'
    };
  }
  if (savedNormal) {
    logWindowState('rejected normal bounds', {
      bounds: savedNormal,
      reason: 'savedNormal invalid for work area'
    });
  }

  if (lastGood && validateNormalBounds(lastGood, workArea)) {
    return {
      bounds: clampBoundsToWorkArea(lastGood, workArea),
      usedFallback: false,
      source: 'lastGood'
    };
  }
  if (lastGood) {
    logWindowState('rejected normal bounds', {
      bounds: lastGood,
      reason: 'lastGood invalid for work area'
    });
  }

  return {
    bounds: getFallbackNormalBounds(workArea),
    usedFallback: true,
    source: 'fallback'
  };
}

export function isBrokenNormalBounds(bounds: WindowBounds, workArea: WorkAreaRect): boolean {
  return isMiniLikeBounds(bounds) || !validateNormalBounds(bounds, workArea);
}

/** Maximized/fullscreen rects often fail workArea validation — never use for bounds correction. */
export function isBrokenNormalBoundsForCorrection(
  bounds: WindowBounds,
  workArea: WorkAreaRect,
  options?: { isMaximized?: boolean; restoringMaximized?: boolean }
): boolean {
  if (options?.isMaximized || options?.restoringMaximized) return false;
  return isBrokenNormalBounds(bounds, workArea);
}
