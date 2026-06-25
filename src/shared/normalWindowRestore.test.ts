import { describe, expect, it } from 'vitest';
import {
  captureBoundsCandidate,
  pickRestoreBounds,
  resolveCenteredFallback,
  shouldPersistNormalBounds
} from './normalWindowRestore';

describe('normalWindowRestore', () => {
  it('does not persist bounds when maximized or fullscreen', () => {
    expect(shouldPersistNormalBounds(true, false)).toBe(false);
    expect(shouldPersistNormalBounds(false, true)).toBe(false);
    expect(shouldPersistNormalBounds(true, true)).toBe(false);
    expect(shouldPersistNormalBounds(false, false)).toBe(true);
  });

  it('does not capture mini-like bounds', () => {
    expect(captureBoundsCandidate({ x: 0, y: 0, width: 440, height: 188 }, false, false)).toBeUndefined();
  });

  it('captures exact normal bounds', () => {
    const bounds = { x: 120, y: 90, width: 1100, height: 720 };
    expect(captureBoundsCandidate(bounds, false, false)).toEqual(bounds);
  });

  it('restore returns exact saved bounds', () => {
    const saved = {
      bounds: { x: 200, y: 100, width: 1024, height: 640 },
      wasMaximized: false,
      wasFullScreen: false,
      savedAt: 1
    };
    expect(pickRestoreBounds(saved, { x: 0, y: 0, width: 1920, height: 1080 })).toEqual(saved.bounds);
  });

  it('restore returns null when was maximized', () => {
    const saved = {
      bounds: { x: 0, y: 0, width: 1280, height: 800 },
      wasMaximized: true,
      wasFullScreen: false,
      savedAt: 1
    };
    expect(pickRestoreBounds(saved, { x: 0, y: 0, width: 1920, height: 1080 })).toBeNull();
  });

  it('invalid saved bounds fallback centered 1280x800', () => {
    const saved = { wasMaximized: false, wasFullScreen: false, savedAt: 0 };
    const restore = pickRestoreBounds(saved, { x: 0, y: 0, width: 1920, height: 1080 });
    expect(restore?.width).toBe(1280);
    expect(restore?.height).toBe(800);
    expect(restore?.x).toBe(Math.round((1920 - 1280) / 2));
  });

  it('resolveCenteredFallback centers in work area', () => {
    const bounds = resolveCenteredFallback({ x: 100, y: 50, width: 1800, height: 1000 });
    expect(bounds.width).toBe(1280);
    expect(bounds.x).toBe(100 + Math.round((1800 - 1280) / 2));
  });
});
