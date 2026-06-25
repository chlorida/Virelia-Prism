import { describe, expect, it } from 'vitest';
import { isMiniLikeBounds, isValidNormalBounds } from '../shared/miniWindowGeometry';

describe('miniWindowShell bounds guards', () => {
  it('does not treat mini dimensions as restorable normal bounds', () => {
    expect(isMiniLikeBounds({ width: 440, height: 188 })).toBe(true);
    expect(isValidNormalBounds({ width: 440, height: 188 })).toBe(false);
  });

  it('accepts typical desktop window as normal', () => {
    expect(isMiniLikeBounds({ width: 1280, height: 800 })).toBe(false);
    expect(isValidNormalBounds({ width: 1280, height: 800 })).toBe(true);
  });
});
