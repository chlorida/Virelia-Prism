// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createPlaybackStore } from './playbackStore';
import { MediaController } from './mediaController';

describe('MediaController attachPreviewHost', () => {
  it('moves the media element between hosts without duplication', () => {
    const store = createPlaybackStore();
    const sink = document.createElement('div');
    const controller = new MediaController(store, { translateError: (key) => key });
    const element = controller.ensureElement(sink);

    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    controller.attachPreviewHost(hostA);
    expect(hostA.contains(element)).toBe(true);

    controller.attachPreviewHost(hostB);
    expect(hostB.contains(element)).toBe(true);
    expect(hostA.contains(element)).toBe(false);

    controller.attachPreviewHost(null);
    expect(sink.contains(element)).toBe(true);
    expect(element.classList.contains('prism-media-engine--hidden')).toBe(true);

    controller.destroy();
  });

  it('ignores redundant attach to the same host', () => {
    const store = createPlaybackStore();
    const sink = document.createElement('div');
    const controller = new MediaController(store, { translateError: (key) => key });
    const element = controller.ensureElement(sink);
    const host = document.createElement('div');
    controller.attachPreviewHost(host);
    controller.attachPreviewHost(host);
    expect(host.querySelectorAll('video').length).toBe(1);
    controller.destroy();
  });
});
