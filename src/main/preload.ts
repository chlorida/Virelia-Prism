import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { PrismApi } from '../shared/prismApi.types';
import type { AppSettings, LibraryScanResult, PlayMediaOptions, PlaybackCommandResult, PlaybackState } from '../shared/types';

const api: PrismApi = {
  settings: {
    load: () => ipcRenderer.invoke('settings:load') as Promise<AppSettings>,
    save: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', settings) as Promise<AppSettings>
  },
  library: {
    chooseFolder: () => ipcRenderer.invoke('library:choose-folder') as Promise<LibraryScanResult | undefined>,
    loadCached: (folders: string[]) =>
      ipcRenderer.invoke('library:load-cached', folders) as Promise<LibraryScanResult | null>,
    scan: (folders: string[]) => ipcRenderer.invoke('library:scan', folders) as Promise<LibraryScanResult>,
    importPaths: (filePaths: string[]) => ipcRenderer.invoke('library:import-paths', filePaths) as Promise<LibraryScanResult>,
    pathsFromFiles: (files: File[]) => {
      const paths = files
        .map((file) => {
          try {
            return webUtils.getPathForFile(file);
          } catch {
            return '';
          }
        })
        .filter(Boolean);
      return ipcRenderer.invoke('library:import-paths', paths) as Promise<LibraryScanResult>;
    }
  },
  playback: {
    status: () => ipcRenderer.invoke('playback:status') as Promise<PlaybackState>,
    play: (mediaId: string, filePath: string, options?: PlayMediaOptions) =>
      ipcRenderer.invoke('playback:play', mediaId, filePath, options) as Promise<PlaybackCommandResult>,
    pause: () => ipcRenderer.invoke('playback:pause') as Promise<PlaybackState>,
    toggle: () => ipcRenderer.invoke('playback:toggle') as Promise<PlaybackState>,
    seek: (positionSeconds: number) => ipcRenderer.invoke('playback:seek', positionSeconds) as Promise<PlaybackState>,
    setVolume: (volume: number) => ipcRenderer.invoke('playback:volume', volume) as Promise<PlaybackState>,
    setSpeed: (speed: number) => ipcRenderer.invoke('playback:speed', speed) as Promise<PlaybackState>,
    setRepeat: (repeat: PlaybackState['repeat']) => ipcRenderer.invoke('playback:set-repeat', repeat) as Promise<PlaybackState>,
    setShuffle: (shuffle: boolean) => ipcRenderer.invoke('playback:set-shuffle', shuffle) as Promise<PlaybackState>,
    reloadEngine: () => ipcRenderer.invoke('playback:reload-engine') as Promise<PlaybackState>,
    stopExternal: () => ipcRenderer.invoke('playback:stop-external') as Promise<void>
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize') as Promise<void>,
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize') as Promise<boolean>,
    isMaximized: () => ipcRenderer.invoke('window:is-maximized') as Promise<boolean>,
    isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen') as Promise<boolean>,
    close: () => ipcRenderer.invoke('window:close') as Promise<void>,
    minimizeToTray: () => ipcRenderer.invoke('window:minimize-to-tray') as Promise<void>,
    enterMiniWindow: (options?: { isVideo?: boolean; animate?: boolean }) =>
      ipcRenderer.invoke('window:enter-mini', options) as Promise<void>,
    exitMiniWindow: (target?: 'restore' | 'library', options?: { animate?: boolean }) =>
      ipcRenderer.invoke('window:exit-mini', target, options) as Promise<void>,
    ensureNormalWindow: (reason?: string) =>
      ipcRenderer.invoke('window:ensure-normal', reason) as Promise<void>,
    getShellWindowMode: () => ipcRenderer.invoke('window:get-shell-mode') as Promise<'normal' | 'mini'>,
    toggleMiniPlayer: (options?: { isVideo?: boolean }) =>
      ipcRenderer.invoke('window:toggle-mini-player', options) as Promise<void>,
    onMaximizeChange: (handler: (maximized: boolean) => void) => {
      const listener = (_: unknown, maximized: boolean) => handler(maximized);
      ipcRenderer.on('prism:window-maximized', listener);
      return () => {
        ipcRenderer.removeListener('prism:window-maximized', listener);
      };
    }
  },
  mediaUrl: (filePath: string) => ipcRenderer.invoke('media:url', filePath) as Promise<string>,
  thumbnails: {
    get: (mediaId: string, filePath: string, fileName?: string, options?: { priority?: number }) =>
      ipcRenderer.invoke('thumbnails:get', mediaId, filePath, fileName, options) as Promise<import('../shared/prismApi.types').ThumbnailApiRecord>,
    retry: (mediaId: string, filePath: string, fileName?: string) =>
      ipcRenderer.invoke('thumbnails:retry', mediaId, filePath, fileName) as Promise<import('../shared/prismApi.types').ThumbnailApiRecord>,
    detectFfmpeg: () =>
      ipcRenderer.invoke('thumbnails:ffmpeg') as Promise<{ available: boolean; path?: string }>,
  },
  metadata: {
    read: (cacheKey: string) =>
      ipcRenderer.invoke('metadata:read', cacheKey) as Promise<import('../shared/titleMetadataTypes').TitleMetadataRecord | null>,
    write: (record: import('../shared/titleMetadataTypes').TitleMetadataRecord) =>
      ipcRenderer.invoke('metadata:write', record) as Promise<void>,
    cacheImage: (remoteUrl: string, kind: 'poster' | 'backdrop' | 'banner' | 'screenshot' | 'trailer') =>
      ipcRenderer.invoke('metadata:cache-image', remoteUrl, kind) as Promise<import('../shared/titleMetadataTypes').TitleMetadataImageResult>,
    delete: (cacheKey: string) =>
      ipcRenderer.invoke('metadata:delete', cacheKey) as Promise<void>,
  },
  system: {
    locale: () => ipcRenderer.invoke('system:locale') as Promise<string>
  },
  onShortcut: (handler: (shortcut: string) => void) => {
    const listener = (_: unknown, shortcut: string) => handler(shortcut);
    ipcRenderer.on('prism:shortcut', listener);
    return () => {
      ipcRenderer.removeListener('prism:shortcut', listener);
    };
  },
  onLibraryUpdated: (handler: (result: LibraryScanResult) => void) => {
    const listener = (_: unknown, result: LibraryScanResult) => handler(result);
    ipcRenderer.on('prism:library-updated', listener);
    return () => ipcRenderer.removeListener('prism:library-updated', listener);
  },
  onMiniPlayer: (handler: (active: boolean) => void) => {
    const listener = (_: unknown, active: boolean) => handler(active);
    ipcRenderer.on('prism:mini-player', listener);
    return () => ipcRenderer.removeListener('prism:mini-player', listener);
  }
};

contextBridge.exposeInMainWorld('prism', api);
console.info('[Virelia preload] loaded');

export type { PrismApi } from '../shared/prismApi.types';
