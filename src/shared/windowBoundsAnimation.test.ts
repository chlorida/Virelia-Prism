import { describe, expect, it } from 'vitest';
import { boundsNearlyEqual, easeOutCubic, lerpBounds, WINDOW_BOUNDS_FRAME_MS, WINDOW_BOUNDS_TARGET_FPS } from './windowBoundsAnimation';

describe('windowBoundsAnimation', () => {
  it('lerpBounds interpolates all fields', () => {
    const from = { x: 0, y: 0, width: 1000, height: 800 };
    const to = { x: 100, y: 200, width: 440, height: 188 };
    const mid = lerpBounds(from, to, 0.5);
    expect(mid).toEqual({ x: 50, y: 100, width: 720, height: 494 });
  });

  it('easeOutCubic ends at 1', () => {
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0)).toBe(0);
  });

  it('boundsNearlyEqual respects tolerance', () => {
    const a = { x: 10, y: 20, width: 440, height: 188 };
    const b = { x: 11, y: 21, width: 441, height: 189 };
    expect(boundsNearlyEqual(a, b)).toBe(true);
    expect(boundsNearlyEqual(a, { ...b, width: 500 })).toBe(false);
  });

  it('uses a conservative native cadence; renderer compensates visually', () => {
    expect(WINDOW_BOUNDS_TARGET_FPS).toBeGreaterThanOrEqual(24);
    expect(WINDOW_BOUNDS_TARGET_FPS).toBeLessThanOrEqual(60);
  });
});
