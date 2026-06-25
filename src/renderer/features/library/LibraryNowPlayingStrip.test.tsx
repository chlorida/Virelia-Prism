// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LibraryNowPlayingStrip } from './LibraryNowPlayingStrip';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

const playbackMockState = {
  isVideo: false,
  currentTrack: { id: 'a1', filePath: '/a.mp3', title: 'Song', fileName: 'a.mp3' },
  playbackStatus: 'playing' as const,
};

vi.mock('../../playback/usePlayback', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../playback/usePlayback')>();
  return {
    ...actual,
    usePlayback: () => ({
      actions: { togglePlay: vi.fn() },
      controllerReady: true,
    }),
    usePlaybackSelector: (selector: (s: typeof playbackMockState) => unknown) =>
      selector(playbackMockState),
  };
});

describe('LibraryNowPlayingStrip', () => {
  it('renders nothing for audio', () => {
    const html = renderToStaticMarkup(
      createElement(LibraryNowPlayingStrip, { onOpenPlayer: () => undefined })
    );
    expect(html).toBe('');
  });
});
