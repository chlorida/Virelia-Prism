import type {
  AppSettings,
  LibraryScanResult,
  PlayMediaOptions,
  PlaybackCommandResult,
  PlaybackState
} from './types';
import type { TitleMetadataImageResult, TitleMetadataRecord } from './titleMetadataTypes';
import type { ShellWindowMode } from './shellWindowTypes';

export type PrismShortcutHandler = (shortcut: string) => void;
export type PrismLibraryUpdatedHandler = (result: LibraryScanResult) => void;
export type PrismMiniPlayerHandler = (active: boolean) => void;

export interface MiniPlayerWindowOptions {
  isVideo?: boolean;
  animate?: boolean;
}
export type PrismMaximizeHandler = (maximized: boolean) => void;
export type Unsubscribe = () => void;

export type ThumbnailApiStatus =
  | 'not-requested'
  | 'queued'
  | 'generating'
  | 'ready'
  | 'failed'
  | 'unsupported'
  | 'ffmpeg-missing'
  | 'path-not-allowed'
  | 'file-missing';

export interface ThumbnailApiRecord {
  status: ThumbnailApiStatus;
  thumbnailPath?: string;
  largeThumbnailPath?: string;
  url?: string;
  largeUrl?: string;
  error?: string;
  attemptedAt?: number;
  cacheKey?: string;
  ffmpegAvailable?: boolean;
  ffmpegPath?: string;
}

/** Desktop bridge API exposed to the renderer (Electron preload or Tauri adapter). */
export interface PrismApi {
  settings: {
    load: () => Promise<AppSettings>;
    save: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  };
  library: {
    chooseFolder: () => Promise<LibraryScanResult | undefined>;
    loadCached: (folders: string[]) => Promise<LibraryScanResult | null>;
    scan: (folders: string[]) => Promise<LibraryScanResult>;
    importPaths: (filePaths: string[]) => Promise<LibraryScanResult>;
    pathsFromFiles: (files: File[]) => Promise<LibraryScanResult>;
  };
  playback: {
    status: () => Promise<PlaybackState>;
    play: (mediaId: string, filePath: string, options?: PlayMediaOptions) => Promise<PlaybackCommandResult>;
    pause: () => Promise<PlaybackState>;
    toggle: () => Promise<PlaybackState>;
    seek: (positionSeconds: number) => Promise<PlaybackState>;
    setVolume: (volume: number) => Promise<PlaybackState>;
    setSpeed: (speed: number) => Promise<PlaybackState>;
    setRepeat: (repeat: PlaybackState['repeat']) => Promise<PlaybackState>;
    setShuffle: (shuffle: boolean) => Promise<PlaybackState>;
    reloadEngine: () => Promise<PlaybackState>;
    stopExternal: () => Promise<void>;
  };
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    isMaximized: () => Promise<boolean>;
    isFullscreen?: () => Promise<boolean>;
    close: () => Promise<void>;
    minimizeToTray: () => Promise<void>;
    enterMiniWindow: (options?: MiniPlayerWindowOptions) => Promise<void>;
    exitMiniWindow: (target?: 'restore' | 'library', options?: { animate?: boolean }) => Promise<void>;
    ensureNormalWindow: (reason?: string) => Promise<void>;
    getShellWindowMode: () => Promise<ShellWindowMode>;
    toggleMiniPlayer: (options?: MiniPlayerWindowOptions) => Promise<void>;
    onMaximizeChange: (handler: PrismMaximizeHandler) => Unsubscribe;
  };
  mediaUrl: (filePath: string) => Promise<string>;
  thumbnails: {
    get: (
      mediaId: string,
      filePath: string,
      fileName?: string,
      options?: { priority?: number }
    ) => Promise<ThumbnailApiRecord>;
    retry: (mediaId: string, filePath: string, fileName?: string) => Promise<ThumbnailApiRecord>;
    detectFfmpeg: () => Promise<{ available: boolean; path?: string }>;
  };
  metadata?: {
    read: (cacheKey: string) => Promise<TitleMetadataRecord | null>;
    write: (record: TitleMetadataRecord) => Promise<void>;
    delete: (cacheKey: string) => Promise<void>;
    cacheImage: (remoteUrl: string, kind: 'poster' | 'backdrop' | 'banner' | 'screenshot' | 'trailer') => Promise<TitleMetadataImageResult>;
  };
  system: {
    locale: () => Promise<string>;
  };
  onShortcut: (handler: PrismShortcutHandler) => Unsubscribe;
  onLibraryUpdated: (handler: PrismLibraryUpdatedHandler) => Unsubscribe;
  onMiniPlayer: (handler: PrismMiniPlayerHandler) => Unsubscribe;
}

export interface AppInfo {
  name: string;
  version: string;
  shell: 'electron' | 'tauri';
}
