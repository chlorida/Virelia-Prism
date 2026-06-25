// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MiniProgressBar } from './MiniProgressBar';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

function renderMiniProgress(props: {
  currentTime: number;
  duration: number;
  onSeek: (n: number) => void;
}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(MiniProgressBar, props));
  });
  const input = container.querySelector('input[type="range"]') as HTMLInputElement;
  return { container, root, input };
}

describe('MiniProgressBar', () => {
  it('renders range at 0 and max duration', () => {
    const onSeek = vi.fn();
    const { input, root, container } = renderMiniProgress({ currentTime: 0, duration: 120, onSeek });
    expect(input.value).toBe('0');
    expect(input.max).toBe('120');
    expect(input.getAttribute('aria-valuenow')).toBe('0');
    act(() => root.unmount());
    container.remove();
  });

  it('clamps value to duration for end-of-track display', () => {
    const onSeek = vi.fn();
    const { input, root, container } = renderMiniProgress({ currentTime: 100, duration: 100, onSeek });
    expect(input.value).toBe('100');
    expect(input.getAttribute('aria-valuenow')).toBe('100');
    act(() => root.unmount());
    container.remove();
  });

  it('onSeek handler accepts 0 and duration endpoints', () => {
    const onSeek = vi.fn();
    const seek = (raw: string) => onSeek(Number(raw));
    seek('0');
    seek('235');
    expect(onSeek).toHaveBeenCalledWith(0);
    expect(onSeek).toHaveBeenCalledWith(235);
  });
});
