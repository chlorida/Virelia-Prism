import { describe, expect, it } from 'vitest';
import { isLikelyUnsupportedContainer, describeMediaError } from './mediaErrors';

describe('mediaErrors', () => {
  it('flags mkv as likely unsupported', () => {
    expect(isLikelyUnsupportedContainer('D:\\media\\clip.mkv')).toBe(true);
  });

  it('maps missing file to missing message key', () => {
    const info = describeMediaError(null, null, (key) => key);
    expect(info.userMessageKey).toBe('error.media.missing');
  });
});
