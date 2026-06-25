import type { WindowBounds } from './miniWindowGeometry';

export function isWindowGeometryDebugEnabled(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
}

export function logMiniEnter(details: Record<string, unknown>): void {
  if (!isWindowGeometryDebugEnabled()) return;
  console.info('[Virelia] enter mini window', details);
}

export function logMiniRestore(details: Record<string, unknown>): void {
  if (!isWindowGeometryDebugEnabled()) return;
  console.info('[Virelia] restore from mini', details);
}

export function warnRestoreBoundsMismatch(
  saved: WindowBounds,
  actual: WindowBounds,
  context?: string
): void {
  if (!isWindowGeometryDebugEnabled()) return;
  const dx = Math.abs(actual.x - saved.x);
  const dy = Math.abs(actual.y - saved.y);
  const dw = Math.abs(actual.width - saved.width);
  const dh = Math.abs(actual.height - saved.height);
  if (dx > 5 || dy > 5 || dw > 5 || dh > 5) {
    console.warn('[Virelia] Window restore mismatch', { saved, actual, context });
  }
}
