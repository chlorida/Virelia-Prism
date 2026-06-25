import { describe, expect, it } from 'vitest';

const HAVE_METADATA = 1;
const HAVE_ENOUGH_DATA = 4;
import { deriveMediaPlaybackUi } from './mediaPlaybackState';

function mockMedia(overrides: Partial<HTMLMediaElement> = {}): HTMLMediaElement {
  return {
    src: 'media://track',
    paused: true,
    ended: false,
    currentTime: 45,
    duration: 180,
    readyState: HAVE_ENOUGH_DATA,
    ...overrides
  } as HTMLMediaElement;
}

describe('deriveMediaPlaybackUi', () => {
  it('shows play when media is paused', () => {
    const ui = deriveMediaPlaybackUi(mockMedia({ paused: true }), true, true, false);
    expect(ui.isPlaying).toBe(false);
    expect(ui.positionSeconds).toBe(45);
  });

  it('shows pause when media is playing', () => {
    const ui = deriveMediaPlaybackUi(mockMedia({ paused: false }), true, true, false);
    expect(ui.isPlaying).toBe(true);
    expect(ui.isLoading).toBe(false);
  });

  it('shows loading instead of playing while buffering', () => {
    const ui = deriveMediaPlaybackUi(
      mockMedia({ paused: false, readyState: HAVE_METADATA }),
      true,
      true,
      false
    );
    expect(ui.isPlaying).toBe(false);
    expect(ui.isLoading).toBe(true);
  });
});
