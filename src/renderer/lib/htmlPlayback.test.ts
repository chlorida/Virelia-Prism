import { describe, expect, it, vi } from 'vitest';
import { configureMediaElement, peekResolvedMediaUrl, resolveMediaUrl } from './htmlPlayback';
import { getPrism } from './prismApi';

vi.mock('./prismApi', () => ({
  getPrism: vi.fn(),
}));

describe('resolveMediaUrl', () => {
  it('resolves via prism.mediaUrl and caches the result', async () => {
    const mediaUrl = vi.fn().mockResolvedValue('prism-media://play/?path=test.mkv');
    vi.mocked(getPrism).mockReturnValue({ mediaUrl } as never);

    await expect(resolveMediaUrl('D:\\test.mkv')).resolves.toBe('prism-media://play/?path=test.mkv');
    await expect(resolveMediaUrl('D:\\test.mkv')).resolves.toBe('prism-media://play/?path=test.mkv');
    expect(mediaUrl).toHaveBeenCalledTimes(1);
    expect(peekResolvedMediaUrl('D:\\test.mkv')).toBe('prism-media://play/?path=test.mkv');
  });
});

describe('configureMediaElement', () => {  it('unmutes element and applies volume', () => {
    const attrs = new Set<string>(['muted']);
    const element = {
      muted: true,
      defaultMuted: true,
      volume: 0,
      playbackRate: 1,
      removeAttribute(name: string) {
        attrs.delete(name);
      },
      hasAttribute(name: string) {
        return attrs.has(name);
      }
    } as HTMLMediaElement;

    configureMediaElement(element, 0.5, 1.25);
    expect(element.muted).toBe(false);
    expect(element.defaultMuted).toBe(false);
    expect(element.hasAttribute('muted')).toBe(false);
    expect(element.volume).toBe(0.5);
    expect(element.playbackRate).toBe(1.25);
  });
});
