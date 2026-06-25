import { describe, expect, it } from 'vitest';
import { miniKindFromOptions } from './shellWindowTypes';

describe('shellWindowTypes', () => {
  it('maps video option to video kind', () => {
    expect(miniKindFromOptions({ isVideo: true })).toBe('video');
    expect(miniKindFromOptions({ isVideo: false })).toBe('audio');
    expect(miniKindFromOptions()).toBe('audio');
  });
});
