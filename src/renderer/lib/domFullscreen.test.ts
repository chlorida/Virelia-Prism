import { describe, expect, it } from 'vitest';
import {
  isDomFullscreenActive,
  isPseudoFullscreenActive,
  isVideoFullscreenActive,
} from './domFullscreen';

describe('domFullscreen', () => {
  it('returns false for null target', () => {
    expect(isDomFullscreenActive(null)).toBe(false);
    expect(isDomFullscreenActive(undefined)).toBe(false);
    expect(isPseudoFullscreenActive(null)).toBe(false);
    expect(isVideoFullscreenActive(null)).toBe(false);
  });
});
