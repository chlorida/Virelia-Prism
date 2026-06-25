import { describe, expect, it, beforeEach } from 'vitest';
import { isMediaPathAllowed, setMediaAllowlist } from './mediaAllowlist';

describe('isMediaPathAllowed', () => {
  beforeEach(() => {
    setMediaAllowlist(['D:\\Music']);
  });

  it('allows files inside indexed folders', () => {
    expect(isMediaPathAllowed('D:\\Music\\Artist\\track.mp3')).toBe(true);
  });

  it('blocks files outside indexed folders', () => {
    expect(isMediaPathAllowed('D:\\Other\\track.mp3')).toBe(false);
  });

  it('blocks all files when no folders are indexed', () => {
    setMediaAllowlist([]);
    expect(isMediaPathAllowed('D:\\Other\\track.mp3')).toBe(false);
  });
});
