import { defaultSettings } from '../../shared/defaults';
import type { PrismApi } from '../../shared/prismApi.types';
import type {
  AppSettings,
  LibraryScanResult,
  PlayMediaOptions,
  PlaybackCommandResult,
  PlaybackState
} from '../../shared/types';
import { noopUnsubscribe } from './prismApi';
import {
  getTauriShellWindowMode,
  tauriEnterMiniWindow,
  tauriEnsureNormalWindow,
  tauriExitMiniWindow,
  tauriToggleMiniPlayer,
} from './tauriMiniWindow';
import { registerTauriLibraryScanBridge, runTauriLibraryScan } from './tauriLibraryRuntime';
import {
  cacheMetadataImage,
  deleteTitleMetadata,
  getFfmpegStatus,
  getLibrary,
  getThumbnailTauri,
  importMediaPaths,
  loadLibraryCached,
  loadSettings,
  onLibraryChanged,
  pickFolder,
  readTitleMetadata,
  retryThumbnailTauri,
  saveSettings,
  scanFoldersToLibraryResult,
  writeTitleMetadata,
} from './tauriCommands';
import type { ThumbnailApiRecord } from '../../shared/prismApi.types';

const noop = (): void => noopUnsubscribe();

const defaultPlaybackState: PlaybackState = {
  playing: false,
  positionSeconds: 0,
  volume: defaultSettings.playback.volume,
  speed: defaultSettings.playback.speed,
  repeat: defaultSettings.playback.repeat,
  shuffle: defaultSettings.playback.shuffle,
  engineStatus: {
    engine: 'html5-fallback',
    available: true,
    message: 'Tauri shell — playback bridge not migrated yet'
  }
};

const defaultPlayResult: PlaybackCommandResult = {
  accepted: true,
  engineStatus: defaultPlaybackState.engineStatus,
  rendererPlayback: true
};

function emptyScan(folders: string[] = []): LibraryScanResult {
  return {
    folders,
    media: [],
    scannedAt: new Date().toISOString()
  };
}

async function tauriLocalAssetUrl(filePath: string | undefined): Promise<string | undefined> {
  if (!filePath) return undefined;
  return tauriMediaUrl(filePath);
}

async function mapThumbnailRecord(record: ThumbnailApiRecord): Promise<ThumbnailApiRecord> {
  const url = record.url ? await tauriLocalAssetUrl(record.url) : undefined;
  const largeUrl = record.largeUrl ? await tauriLocalAssetUrl(record.largeUrl) : undefined;
  return {
    ...record,
    url,
    largeUrl,
    status: record.status as ThumbnailApiRecord['status'],
  };
}

async function mapMetadataImageResult(
  result: Awaited<ReturnType<typeof cacheMetadataImage>>
): Promise<{ localPath?: string; displayUrl?: string; failed?: boolean }> {
  const displayUrl = result.localPath
    ? await tauriLocalAssetUrl(result.localPath)
    : result.displayUrl;
  return {
    localPath: result.localPath,
    displayUrl,
    failed: result.failed,
  };
}

async function tauriMediaUrl(filePath: string): Promise<string> {
  if (!filePath) return '';
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    return convertFileSrc(filePath);
  } catch (error) {
    console.warn('[Virelia] convertFileSrc failed', filePath, error);
    return '';
  }
}

let convertFileSrcPreloaded = false;
function preloadConvertFileSrc(): void {
  if (convertFileSrcPreloaded) return;
  convertFileSrcPreloaded = true;
  void import('@tauri-apps/api/core');
}

async function tauriWindowAction(action: 'minimize' | 'toggle_maximize' | 'close'): Promise<boolean | void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  if (action === 'minimize') {
    await win.minimize();
    return;
  }
  if (action === 'close') {
    await win.close();
    return;
  }
  const maximized = await win.isMaximized();
  if (maximized) await win.unmaximize();
  else await win.maximize();
  return await win.isMaximized();
}

async function persistFolderInSettings(folder: string): Promise<AppSettings> {
  const settings = await loadSettings();
  const libraryFolders = settings.libraryFolders.includes(folder)
    ? settings.libraryFolders
    : [...settings.libraryFolders, folder];
  return saveSettings({ libraryFolders });
}

/** Tauri shell — Rust library scan, settings, and renderer playback bridge. */
export function createTauriPrismApi(): PrismApi {
  registerTauriLibraryScanBridge();
  preloadConvertFileSrc();

  return {
    settings: {
      load: loadSettings,
      save: saveSettings
    },
    library: {
      chooseFolder: async () => {
        const folder = await pickFolder();
        if (!folder) return undefined;
        const settings = await loadSettings();
        if (settings.libraryFolders.includes(folder)) {
          return {
            folders: settings.libraryFolders,
            media: [],
            scannedAt: new Date().toISOString(),
            folderAlreadyIndexed: true,
          };
        }
        return runTauriLibraryScan(async () => {
          const nextSettings = await persistFolderInSettings(folder);
          return scanFoldersToLibraryResult(nextSettings.libraryFolders);
        });
      },
      loadCached: async (folders) => {
        const cached = await loadLibraryCached(folders);
        if (!cached || cached.media.length === 0) return null;
        return {
          folders: cached.folders,
          media: cached.media,
          scannedAt: cached.scannedAt,
          counts: {
            all: cached.counts.all,
            audio: cached.counts.audio,
            video: cached.counts.video,
            favorites: 0,
            recent: 0,
          },
        };
      },
      scan: async (folders) => runTauriLibraryScan(() => scanFoldersToLibraryResult(folders)),
      importPaths: async (filePaths) => {
        const paths = filePaths.map((p) => p.trim()).filter(Boolean);
        if (paths.length === 0) return emptyScan();
        return importMediaPaths(paths);
      },
      pathsFromFiles: async (files) => {
        const paths = files
          .map((file) => {
            const withPath = file as File & { path?: string };
            return withPath.path?.trim() ?? '';
          })
          .filter(Boolean);
        if (paths.length === 0) return emptyScan();
        return importMediaPaths(paths);
      }
    },
    playback: {
      status: async () => defaultPlaybackState,
      play: async () => defaultPlayResult,
      pause: async () => defaultPlaybackState,
      toggle: async () => defaultPlaybackState,
      seek: async () => defaultPlaybackState,
      setVolume: async (volume) => ({ ...defaultPlaybackState, volume }),
      setSpeed: async (speed) => ({ ...defaultPlaybackState, speed }),
      setRepeat: async (repeat) => ({ ...defaultPlaybackState, repeat }),
      setShuffle: async (shuffle) => ({ ...defaultPlaybackState, shuffle }),
      reloadEngine: async () => defaultPlaybackState,
      stopExternal: async () => undefined
    },
    window: {
      minimize: async () => { await tauriWindowAction('minimize'); },
      toggleMaximize: async () => Boolean(await tauriWindowAction('toggle_maximize')),
      isMaximized: async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        return getCurrentWindow().isMaximized();
      },
      isFullscreen: async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        return getCurrentWindow().isFullscreen();
      },
      close: async () => { await tauriWindowAction('close'); },
      minimizeToTray: async () => undefined,
      enterMiniWindow: async (options) => {
        await tauriEnterMiniWindow(Boolean(options?.isVideo), { animate: options?.animate });
      },
      exitMiniWindow: async (target?: 'restore' | 'library', options?: { animate?: boolean }) => {
        const reason = target === 'library' ? 'mini-x-to-library' : 'mini-restore';
        await tauriExitMiniWindow(reason, { animate: options?.animate });
      },
      ensureNormalWindow: async (reason?: string) => {
        await tauriEnsureNormalWindow(reason);
      },
      getShellWindowMode: async () => getTauriShellWindowMode(),
      toggleMiniPlayer: async (options) => {
        await tauriToggleMiniPlayer(Boolean(options?.isVideo));
      },
      onMaximizeChange: () => noop
    },
    mediaUrl: tauriMediaUrl,
    thumbnails: {
      get: async (mediaId, filePath, fileName, options) =>
        mapThumbnailRecord(await getThumbnailTauri(mediaId, filePath, fileName, options?.priority)),
      retry: async (mediaId, filePath, fileName) =>
        mapThumbnailRecord(await retryThumbnailTauri(mediaId, filePath, fileName)),
      detectFfmpeg: async () => {
        const status = await getFfmpegStatus();
        return {
          available: status.available,
          path: status.ffmpegPath,
        };
      },
    },
    metadata: {
      read: readTitleMetadata,
      write: writeTitleMetadata,
      delete: deleteTitleMetadata,
      cacheImage: async (remoteUrl, kind) =>
        mapMetadataImageResult(await cacheMetadataImage(remoteUrl, kind)),
    },
    system: {
      locale: async () => navigator.language || 'en'
    },
    onShortcut: () => noop,
    onLibraryUpdated: (handler) => {
      let active = true;
      let dispose: (() => void) | undefined;
      void onLibraryChanged((payload) => {
        if (active) handler(payload);
      }).then((unlisten) => {
        dispose = unlisten;
      });
      return () => {
        active = false;
        dispose?.();
      };
    },
    onMiniPlayer: () => noop
  };
}
