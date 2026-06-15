// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../shared/defaults';
import type { AppSettings, LibraryScanResult, PlaybackState } from '../shared/types';
import { App } from './App';
import { PLAYBACK_SESSION_KEY } from './lib/playbackPersistence';

vi.mock('./lib/tauriCommands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/tauriCommands')>();
  return {
    ...actual,
    onSetupDownloadProgress: async () => () => undefined,
  };
});

import { loadPlaybackSession } from './lib/playbackPersistence';

function createMockPrism() {
  const settings: AppSettings = { ...defaultSettings };
  const playbackState: PlaybackState = {
    playing: false,
    positionSeconds: 0,
    volume: settings.playback.volume,
    speed: settings.playback.speed,
    repeat: settings.playback.repeat,
    shuffle: settings.playback.shuffle,
    engineStatus: {
      engine: 'html5-fallback',
      available: true,
      message: 'mock'
    }
  };

  return {
    settings: {
      load: async () => settings,
      save: async (patch: Partial<AppSettings>) => {
        Object.assign(settings, patch);
        return settings;
      }
    },
    library: {
      chooseFolder: async () => undefined,
      scan: async (): Promise<LibraryScanResult> => ({
        folders: [],
        media: [],
        scannedAt: new Date().toISOString()
      }),
      importPaths: async (): Promise<LibraryScanResult> => ({
        folders: [],
        media: [],
        scannedAt: new Date().toISOString()
      }),
      pathsFromFiles: async (): Promise<LibraryScanResult> => ({
        folders: [],
        media: [],
        scannedAt: new Date().toISOString()
      })
    },
    playback: {
      status: async () => playbackState,
      play: async () => ({ state: playbackState }),
      pause: async () => playbackState,
      toggle: async () => playbackState,
      seek: async () => playbackState,
      setVolume: async () => playbackState,
      setSpeed: async () => playbackState,
      setRepeat: async () => playbackState,
      setShuffle: async () => playbackState,
      reloadEngine: async () => playbackState,
      stopExternal: async () => undefined
    },
    window: {
      minimize: async () => undefined,
      toggleMaximize: async () => false,
      isMaximized: async () => false,
      close: async () => undefined,
      minimizeToTray: async () => undefined,
      enterMiniWindow: async () => undefined,
      exitMiniWindow: async () => undefined,
      ensureNormalWindow: async () => undefined,
      getShellWindowMode: async () => 'normal' as const,
      toggleMiniPlayer: async () => undefined,
      onMaximizeChange: () => () => undefined
    },
    mediaUrl: async (filePath: string) => `file://${encodeURIComponent(filePath)}`,
    system: { locale: async () => 'en-US' },
    onShortcut: () => () => undefined,
    onLibraryUpdated: () => () => undefined,
    onMiniPlayer: () => () => undefined
  };
}

describe('App startup', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    class MockResizeObserver {
      observe(): void { /* mock */ }
      disconnect(): void { /* mock */ }
      unobserve(): void { /* mock */ }
    }
    globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;

    window.prism = createMockPrism() as unknown as typeof window.prism;
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    localStorage.clear();
  });

  it('renders app shell without throwing', async () => {
    await act(async () => {
      root!.render(createElement(App));
    });
    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
    });
    expect(container!.querySelector('.app-frame')).toBeTruthy();
    expect(container!.querySelector('.title-bar')).toBeTruthy();
    expect(container!.querySelector('.library-panel')).toBeTruthy();
  });

  it('ignores corrupted playback session JSON', () => {
    localStorage.setItem(PLAYBACK_SESSION_KEY, '{not-json');
    expect(loadPlaybackSession()).toBeNull();
  });
});
