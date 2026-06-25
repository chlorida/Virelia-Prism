import { describe, expect, it } from 'vitest';
import {
  computeMiniBounds,
  getMiniWindowSize,
  isMiniLikeBounds,
  isValidNormalBounds,
  workAreaPhysicalToLogical
} from './miniWindowGeometry';

describe('miniWindowGeometry', () => {
  it('uses compact audio and video sizes', () => {
    expect(getMiniWindowSize('audio')).toEqual({ width: 440, height: 188 });
    expect(getMiniWindowSize('video')).toEqual({ width: 480, height: 320 });
  });

  it('computeMiniBounds places window in bottom-right work area', () => {
    const bounds = computeMiniBounds(
      { x: 0, y: 0, width: 1920, height: 1040 },
      { width: 440, height: 188 }
    );
    expect(bounds).toEqual({ x: 1470, y: 842, width: 440, height: 188 });
  });

  it('computeMiniBounds clamps inside small work areas', () => {
    const bounds = computeMiniBounds(
      { x: 100, y: 100, width: 500, height: 400 },
      { width: 440, height: 188 },
      10
    );
    expect(bounds.x).toBeGreaterThanOrEqual(110);
    expect(bounds.y).toBeGreaterThanOrEqual(110);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(590);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(490);
  });

  it('detects mini-like vs valid normal bounds', () => {
    expect(isMiniLikeBounds({ width: 440, height: 188 })).toBe(true);
    expect(isMiniLikeBounds({ width: 1280, height: 800 })).toBe(false);
    expect(isValidNormalBounds({ width: 1280, height: 800 })).toBe(true);
    expect(isValidNormalBounds({ width: 440, height: 188 })).toBe(false);
  });

  it('converts physical work area to logical for DPI', () => {
    const logical = workAreaPhysicalToLogical(
      { x: 0, y: 0, width: 2560, height: 1300 },
      1.25
    );
    expect(logical.width).toBe(2048);
    expect(logical.height).toBe(1040);
  });
});
