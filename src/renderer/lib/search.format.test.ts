import { describe, expect, it } from 'vitest';
import { formatDuration } from './search';

describe('formatDuration', () => {
  it('returns --:-- for unknown values', () => {
    expect(formatDuration(undefined)).toBe('--:--');
    expect(formatDuration(Number.NaN)).toBe('--:--');
    expect(formatDuration(-1)).toBe('--:--');
  });

  it('formats seconds and hours consistently', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(92)).toBe('1:32');
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});
