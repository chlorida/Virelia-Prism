import { describe, expect, it } from 'vitest';

import {
  clampBoundsToWorkArea,
  getFallbackNormalBounds,
  isBrokenNormalBoundsForCorrection,
  pickTargetNormalBounds,
  validateNormalBounds
} from './normalBoundsValidation';

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

describe('validateNormalBounds', () => {
  it('accepts valid normal bounds inside work area', () => {
    expect(validateNormalBounds({ x: 100, y: 80, width: 1280, height: 800 }, workArea)).toBe(true);
  });

  it('rejects mini-sized bounds as normal', () => {
    expect(validateNormalBounds({ x: 1400, y: 820, width: 440, height: 188 }, workArea)).toBe(false);
  });

  it('rejects bounds mostly offscreen to the right/bottom', () => {
    expect(validateNormalBounds({ x: 1800, y: 950, width: 1100, height: 700 }, workArea)).toBe(false);
  });

  it('rejects NaN coordinates', () => {
    expect(validateNormalBounds({ x: NaN, y: 80, width: 1280, height: 800 }, workArea)).toBe(false);
  });
});

describe('clampBoundsToWorkArea', () => {
  it('pulls partially offscreen bounds inside work area', () => {
    const clamped = clampBoundsToWorkArea({ x: 1750, y: 900, width: 1100, height: 700 }, workArea);
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(workArea.x + workArea.width);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(workArea.y + workArea.height);
    expect(validateNormalBounds(clamped, workArea)).toBe(true);
  });
});

describe('getFallbackNormalBounds', () => {
  it('returns centered bounds inside work area', () => {
    const fb = getFallbackNormalBounds(workArea);
    expect(fb.width).toBeLessThanOrEqual(workArea.width - 80);
    expect(fb.height).toBeLessThanOrEqual(workArea.height - 80);
    expect(validateNormalBounds(fb, workArea)).toBe(true);
    expect(fb.x).toBeGreaterThanOrEqual(workArea.x);
    expect(fb.y).toBeGreaterThanOrEqual(workArea.y);
  });
});

describe('isBrokenNormalBoundsForCorrection', () => {
  it('does not treat maximized work-area overflow as broken', () => {
    const maximizedLike = { x: 0, y: 0, width: 1920, height: 1080 };
    expect(isBrokenNormalBoundsForCorrection(maximizedLike, workArea, { isMaximized: true })).toBe(false);
  });
});

describe('pickTargetNormalBounds', () => {
  it('uses saved when valid', () => {
    const saved = { x: 220, y: 140, width: 1100, height: 700 };
    const pick = pickTargetNormalBounds(workArea, saved, { x: 50, y: 50, width: 900, height: 600 });
    expect(pick.source).toBe('savedNormal');
    expect(pick.bounds).toMatchObject(saved);
  });

  it('uses lastGood when saved is mini-sized', () => {
    const lastGood = { x: 200, y: 120, width: 1280, height: 800 };
    const pick = pickTargetNormalBounds(workArea, { x: 1500, y: 900, width: 440, height: 188 }, lastGood);
    expect(pick.source).toBe('lastGood');
    expect(pick.bounds).toMatchObject(lastGood);
  });

  it('uses fallback when both invalid', () => {
    const pick = pickTargetNormalBounds(
      workArea,
      { x: 1500, y: 900, width: 440, height: 188 },
      { x: 1800, y: 950, width: 440, height: 188 }
    );
    expect(pick.source).toBe('fallback');
    expect(pick.usedFallback).toBe(true);
    expect(validateNormalBounds(pick.bounds, workArea)).toBe(true);
  });
});
