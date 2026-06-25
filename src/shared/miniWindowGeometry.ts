export type MiniMediaKind = 'audio' | 'video';

/** Gap from workArea edge (above taskbar, near system tray). */
export const MINI_WINDOW_MARGIN = 10;

export const MINI_AUDIO_SIZE = { width: 440, height: 188 } as const;
export const MINI_VIDEO_SIZE = { width: 480, height: 320 } as const;

export const NORMAL_WINDOW_FALLBACK = {
  width: 1280,
  height: 800,
  x: 80,
  y: 48
} as const;

/** Bounds at or below this are treated as mini, not saved as "normal". */
export const MINI_LIKE_MAX_WIDTH = 520;
export const MINI_LIKE_MAX_HEIGHT = 360;

export interface WorkAreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowBounds extends WorkAreaRect {
  width: number;
  height: number;
}

export function getMiniWindowSize(kind: MiniMediaKind): { width: number; height: number } {
  return kind === 'video' ? { ...MINI_VIDEO_SIZE } : { ...MINI_AUDIO_SIZE };
}

export function isMiniLikeBounds(bounds: Pick<WindowBounds, 'width' | 'height'>): boolean {
  return bounds.width <= MINI_LIKE_MAX_WIDTH && bounds.height <= MINI_LIKE_MAX_HEIGHT;
}

export function isValidNormalBounds(bounds: Pick<WindowBounds, 'width' | 'height'>): boolean {
  return bounds.width >= 700 && bounds.height >= 500 && bounds.width <= 5000 && bounds.height <= 3000;
}

/** Convert physical monitor work area to logical DIP (Tauri on Windows). */
export function workAreaPhysicalToLogical(
  workArea: WorkAreaRect,
  scaleFactor: number
): WorkAreaRect {
  const scale = scaleFactor > 0 ? scaleFactor : 1;
  return {
    x: workArea.x / scale,
    y: workArea.y / scale,
    width: workArea.width / scale,
    height: workArea.height / scale
  };
}

/**
 * Bottom-right placement inside work area (logical coordinates).
 * Clamps so the full window stays inside workArea.
 */
export function computeMiniBounds(
  workArea: WorkAreaRect,
  size: { width: number; height: number },
  margin = MINI_WINDOW_MARGIN
): WindowBounds {
  const maxX = workArea.x + workArea.width - size.width - margin;
  const maxY = workArea.y + workArea.height - size.height - margin;
  const minX = workArea.x + margin;
  const minY = workArea.y + margin;

  return {
    x: Math.round(Math.max(minX, Math.min(maxX, maxX))),
    y: Math.round(Math.max(minY, Math.min(maxY, maxY))),
    width: size.width,
    height: size.height
  };
}

/** @deprecated Use computeMiniBounds */
export function getMiniWindowPosition(
  workArea: WorkAreaRect,
  windowWidth: number,
  windowHeight: number,
  margin = MINI_WINDOW_MARGIN
): { x: number; y: number } {
  const bounds = computeMiniBounds(workArea, { width: windowWidth, height: windowHeight }, margin);
  return { x: bounds.x, y: bounds.y };
}

export function getExpectedMiniDimensions(kind: MiniMediaKind): { width: number; height: number } {
  return getMiniWindowSize(kind);
}
