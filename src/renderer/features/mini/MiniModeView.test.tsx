// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MiniModeView } from './MiniModeView';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

const playbackMockState = {
  isVideo: false,
  currentTrack: { id: '1', title: 'Track', fileName: 'a.mp3', kind: 'audio' },
  playbackStatus: 'playing' as const,
  currentTime: 12,
  duration: 200,
  muted: false,
};

vi.mock('../../playback/usePlayback', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../playback/usePlayback')>();
  return {
    ...actual,
    usePlayback: () => ({
      state: playbackMockState,
      actions: {
        togglePlay: vi.fn(),
        seek: vi.fn(),
        setMuted: vi.fn(),
      },
      controllerReady: true,
    }),
    usePlaybackSelector: (selector: (s: typeof playbackMockState) => unknown) =>
      selector(playbackMockState),
  };
});

vi.mock('../../app/AppShellContext', () => ({
  useAppShell: () => ({
    durationSeconds: 200,
    playPrevious: vi.fn(),
    playNext: vi.fn(),
    modeTransitions: { restoreMini: vi.fn(), closeMiniToLibrary: vi.fn() }
  })
}));

vi.mock('../../lib/prismApi', () => ({
  getPrism: () => ({
    window: { minimize: vi.fn() }
  })
}));

describe('MiniModeView', () => {
  it('renders compact mini shell, not full app chrome', () => {
    const html = renderToStaticMarkup(createElement(MiniModeView));
    expect(html).toContain('mini-shell');
    expect(html).toContain('mini-card');
    expect(html).toContain('mini-player--audio');
    expect(html).not.toContain('library-panel');
    expect(html).not.toContain('playback-bar');
  });

  it('includes restore and close mini actions', () => {
    const html = renderToStaticMarkup(createElement(MiniModeView));
    expect(html).toContain('player.restoreWindow');
    expect(html).toContain('player.closeMini');
    expect(html).not.toContain('player.exitMini');
  });
});
