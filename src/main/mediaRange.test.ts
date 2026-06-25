import { describe, expect, it } from 'vitest';
import { mediaMimeType, parseByteRange } from './mediaRange';

describe('parseByteRange', () => {
  it('parses open-ended ranges', () => {
    expect(parseByteRange('bytes=100-', 1000)).toEqual([100, 999]);
  });

  it('parses closed ranges', () => {
    expect(parseByteRange('bytes=0-499', 1000)).toEqual([0, 499]);
  });

  it('parses suffix ranges', () => {
    expect(parseByteRange('bytes=-200', 1000)).toEqual([800, 999]);
  });

  it('rejects invalid ranges', () => {
    expect(parseByteRange('bytes=500-100', 1000)).toBeUndefined();
    expect(parseByteRange('invalid', 1000)).toBeUndefined();
  });
});

describe('mediaMimeType', () => {
  it('maps common extensions', () => {
    expect(mediaMimeType('C:\\music\\track.mp3')).toBe('audio/mpeg');
    expect(mediaMimeType('C:\\clips\\clip.mkv')).toBe('video/x-matroska');
  });
});
