// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MiniVolumeControl } from './MiniVolumeControl';

const setVolume = vi.fn();
const setMuted = vi.fn();

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

const playbackMockState = { volume: 0.6, muted: false };

vi.mock('../../playback/usePlayback', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../playback/usePlayback')>();
  return {
    ...actual,
    usePlayback: () => ({ actions: { setVolume, setMuted }, controllerReady: true }),
    usePlaybackSelector: (selector: (s: typeof playbackMockState) => unknown) =>
      selector(playbackMockState),
  };
});

describe('MiniVolumeControl', () => {
  it('renders volume slider and mute button', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => { root.render(createElement(MiniVolumeControl)); });
    expect(container.querySelector('.mini-volume__slider')).toBeTruthy();
    expect(container.querySelector('.mini-volume__mute')).toBeTruthy();
    act(() => root.unmount());
  });

  it('mute toggles without calling setVolume', () => {
    setVolume.mockClear();
    setMuted.mockClear();
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => { root.render(createElement(MiniVolumeControl)); });
    const mute = container.querySelector('.mini-volume__mute') as HTMLButtonElement;
    mute.click();
    expect(setMuted).toHaveBeenCalledWith(true);
    expect(setVolume).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('volume change parses slider value', () => {
    const onVolume = (raw: string) => setVolume(Number(raw));
    onVolume('0.42');
    expect(setVolume).toHaveBeenCalledWith(0.42);
  });
});
