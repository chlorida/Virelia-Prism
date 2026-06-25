import { describe, expect, it } from 'vitest';
import { PLAYBACK_SPEEDS } from './SpeedMenu';

describe('PLAYBACK_SPEEDS', () => {
  it('includes standard rates', () => {
    expect([...PLAYBACK_SPEEDS]).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
  });
});
