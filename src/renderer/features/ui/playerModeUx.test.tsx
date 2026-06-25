// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import { enterPlayerMode, playerModeStore } from './playerModeStore';
import { AppModeRouter } from '../../app/AppModeRouter';
import { PlaybackBar } from '../../components/PlaybackBar';

const audioMedia = {
  id: 'a1',
  filePath: '/a.mp3',
  title: 'Song',
  fileName: 'a.mp3',
  kind: 'audio',
  folder: '',
  tags: [],
  addedAt: '0',
  favorite: false
} as MediaItem;

const videoMedia = {
  id: 'v1',
  filePath: '/v.mp4',
  title: 'Clip',
  fileName: 'v.mp4',
  kind: 'video',
  folder: '',
  tags: [],
  addedAt: '0',
  favorite: false
} as MediaItem;

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'en' as const })
}));

vi.mock('../../hooks/useMediaDisplayLanguage', () => ({
  useMediaDisplayLanguage: () => 'en' as const
}));

const playbackState = {
  isVideo: false,
  currentTrack: { id: 'a1', kind: 'audio', title: 'Song' },
  isPreviewCollapsed: true,
  playbackStatus: 'paused' as const
};

vi.mock('../../playback/usePlayback', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../playback/usePlayback')>();
  return {
    ...actual,
    usePlayback: () => ({
      actions: { setPreviewCollapsed: vi.fn(), attachPreviewHost: vi.fn(), togglePlay: vi.fn() },
      controllerReady: true,
    }),
    usePlaybackSelector: (selector: (s: typeof playbackState) => unknown) => selector(playbackState),
  };
});

vi.mock('../../app/AppShellContext', () => ({
  useAppShell: () => ({
    playerMode: playerModeStore.getState().mode,
    videoTheaterOpen: false,
    settings: {
      uiLanguage: 'en',
      metadata: {},
      shell: { pinSidebar: false, alwaysShowRightPanel: false },
    },
    shellPresentation: {
      sidebar: 'rail',
      rightPanel: 'compact',
      rightPanelTabs: 'minimal',
      showBackdrop: false,
      effectiveQueueDocked: true,
      showQueueToggle: false,
      contentClasses: ['app-content', 'app-content--queue-docked'],
    },
    filter: 'all',
    sort: 'alphabetical',
    playlists: [],
    activePlaylistId: null,
    handleFilterChange: vi.fn(),
    importFolder: vi.fn(),
    setPrompt: vi.fn(),
    selectPlaylist: vi.fn(),
    playPlaylist: vi.fn(),
    setSettingsOpen: vi.fn(),
    queue: [],
    queueDrawerOpen: false,
    setQueueDrawerOpen: vi.fn(),
    layoutMode: 'wide',
    playMedia: vi.fn(),
    addToQueue: vi.fn(),
    currentMedia: undefined,
  })
}));

vi.mock('../../app/LibraryDerivedContext', () => ({
  useLibraryDerivedContext: () => ({
    counts: { all: 0, audio: 0, video: 0, favorites: 0, recent: 0 },
    visibleMedia: [],
    mediaById: new Map(),
    historyItems: [],
  })
}));

vi.mock('../../components/LibraryPanel', () => ({
  LibraryPanel: () => createElement('div', { 'data-testid': 'library-panel' })
}));

vi.mock('../library/LibraryContent', () => ({
  LibraryContent: () => createElement('div', { 'data-testid': 'library-mode' })
}));

vi.mock('../player/VideoPlayerModeView', () => ({
  VideoPlayerModeView: () => createElement('div', { 'data-testid': 'player-mode' })
}));

vi.mock('../ui/RightSidePanel', () => ({
  RightSidePanel: () => createElement('div', { 'data-testid': 'right-rail', className: 'smart-right-panel' })
}));

describe('player mode UX', () => {
  beforeEach(() => {
    playerModeStore.patch({ mode: 'library', returnMode: 'library', videoTheater: false });
    playbackState.isVideo = false;
  });

  it('audio player mode routes to library view', () => {
    enterPlayerMode();
    const html = renderToStaticMarkup(createElement(AppModeRouter));
    expect(html).toContain('library-mode');
    expect(html).not.toContain('player-mode');
    expect(html.match(/right-rail/g)?.length ?? 0).toBe(1);
  });

  it('video player mode routes to player view', () => {
    playbackState.isVideo = true;
    enterPlayerMode();
    const html = renderToStaticMarkup(createElement(AppModeRouter));
    expect(html).toContain('player-mode');
    expect(html.match(/right-rail/g)?.length ?? 0).toBe(1);
  });

  it('audio library playback bar hides open video mode', () => {
    const html = renderToStaticMarkup(
      createElement(PlaybackBar, {
        playback: {
          playing: false,
          positionSeconds: 0,
          volume: 1,
          speed: 1,
          repeat: 'off',
          shuffle: false,
          engineStatus: { engine: 'html5-fallback', available: true, message: '' }
        },
        media: audioMedia,
        durationSeconds: 100,
        liveDurationSeconds: 100,
        bufferedEnd: 0,
        isPlaying: false,
        playerMode: 'library',
        isVideo: false,
        onOpenPlayer: () => undefined,
        onToggle: () => undefined,
        onPrevious: () => undefined,
        onNext: () => undefined,
        onSeek: () => undefined,
        onVolume: () => undefined,
        onSpeed: () => undefined,
        onRepeatChange: () => undefined,
        onShuffleChange: () => undefined,
        onMiniPlayer: () => undefined
      })
    );
    expect(html).not.toContain('player.openVideoMode');
  });

  it('video library playback bar shows open video mode', () => {
    const html = renderToStaticMarkup(
      createElement(PlaybackBar, {
        playback: {
          playing: false,
          positionSeconds: 0,
          volume: 1,
          speed: 1,
          repeat: 'off',
          shuffle: false,
          currentMediaId: 'v1',
          engineStatus: { engine: 'html5-fallback', available: true, message: '' }
        },
        media: videoMedia,
        durationSeconds: 100,
        liveDurationSeconds: 100,
        bufferedEnd: 0,
        isPlaying: false,
        playerMode: 'library',
        isVideo: true,
        onOpenPlayer: () => undefined,
        onToggle: () => undefined,
        onPrevious: () => undefined,
        onNext: () => undefined,
        onSeek: () => undefined,
        onVolume: () => undefined,
        onSpeed: () => undefined,
        onRepeatChange: () => undefined,
        onShuffleChange: () => undefined,
        onMiniPlayer: () => undefined
      })
    );
    expect(html).toContain('player.open');
  });
});
