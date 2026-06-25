import { describe, expect, it } from 'vitest';
import { seekSecondsForRatio } from './thumbnailFrameCapture';

describe('seekSecondsForRatio', () => {
  it('spreads seeks across full movie duration instead of capping at 90s', () => {
    const duration = 53 * 60 + 55;
    const early = seekSecondsForRatio(duration, 0.08);
    const late = seekSecondsForRatio(duration, 0.9);
    expect(early).toBeGreaterThan(200);
    expect(early).toBeLessThan(400);
    expect(late).toBeGreaterThan(2400);
    expect(early).not.toBe(late);
  });

  it('keeps short clips inside file bounds', () => {
    const duration = 90;
    const seek = seekSecondsForRatio(duration, 0.5);
    expect(seek).toBeGreaterThan(0);
    expect(seek).toBeLessThan(duration);
  });
});
