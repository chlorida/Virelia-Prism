// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MediaList } from './MediaList';

vi.mock('../i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

const playbackMockState = {
  isVideo: true,
  isPreviewVisible: true,
  currentTrack: { id: 'v1', kind: 'video', filePath: '/v.mp4', title: 'Clip', fileName: 'v.mp4' },
  isPreviewCollapsed: false,
  playbackStatus: 'paused' as const,
  error: null as string | null,
};

vi.mock('../playback/usePlayback', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../playback/usePlayback')>();
  return {
    ...actual,
    usePlayback: () => ({
      state: playbackMockState,
      actions: {
        setPreviewCollapsed: vi.fn(),
        attachPreviewHost: vi.fn(),
      },
      controllerReady: true,
    }),
    usePlaybackSelector: (selector: (s: typeof playbackMockState) => unknown) =>
      selector(playbackMockState),
  };
});

vi.mock('./VirtualMediaTable', () => ({
  VirtualMediaTable: () => createElement('div', { 'data-testid': 'virtual-table' })
}));

vi.mock('./UiSoundToggle', () => ({
  UiSoundToggle: () => null,
}));

vi.mock('../features/library/LibraryRouter', () => ({
  LibraryRouter: () => createElement('div', { 'data-testid': 'library-router' })
}));

const baseProps = {
  items: [],
  durationById: {},
  totalMatches: 0,
  listCapped: false,
  query: '',
  heroVisible: false,
  playlists: [],
  onDismissHero: () => undefined,
  onQueryChange: () => undefined,
  onImportFolder: () => undefined,
  onPlay: () => undefined,
  onQueue: () => undefined,
  onFavorite: () => undefined,
  onAddToPlaylist: () => undefined,
  onFocusRow: () => undefined
};

describe('MediaList libraryMode', () => {
  it('does not render the large video preview workspace', () => {
    const html = renderToStaticMarkup(
      createElement(MediaList, { ...baseProps, libraryMode: true, onOpenPlayer: () => undefined })
    );
    expect(html).not.toContain('media-workspace__preview');
    expect(html).not.toContain('video-stage-host');
    expect(html).toContain('media-workspace--library-mode');
    expect(html).toContain('library-router');
  });

  it('renders the preview workspace shell outside library mode', () => {
    const html = renderToStaticMarkup(createElement(MediaList, { ...baseProps, libraryMode: false }));
    expect(html).toContain('media-workspace__preview');
  });
});
