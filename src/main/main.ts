import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import type { MiniMediaKind } from '../shared/miniWindowGeometry';
import type { AppSettings } from '../shared/types';
import { installMediaProtocolHandler, registerMediaProtocol, toMediaProtocolUrl } from './mediaProtocol';
import { createMediaItemsFromPaths, LibraryIndexer, LibraryWatcher } from './library/libraryIndexer';
import { isMediaPathAllowed, setMediaAllowlist } from './mediaAllowlist';
import {
  attachWindowLifecycle,
  createMiniShellState,
  enterMiniShell,
  ensureNormalShell,
  exitMiniShell,
  getShellWindowMode
} from './miniWindowShell';
import { miniKindFromOptions } from '../shared/shellWindowTypes';
import { HtmlFallbackEngine } from './playback/htmlFallbackEngine';
import { MpvPlaybackEngine } from './playback/mpvEngine';
import { PlaybackService } from './playback/playbackService';
import { SettingsStore } from './settings/settingsStore';
import { readLibraryDiskCache } from './library/libraryDiskCache';
import { writeLibraryDiskCache } from './library/libraryDiskCache';
import { locateFfmpeg } from './thumbnails/ffmpegLocator';
import {
  getThumbnailStatus,
  requestThumbnailGeneration,
  retryThumbnail,
} from './thumbnails/thumbnailService';
import { configureTaskbarControls, ShortcutController, TrayController, WindowsMediaSessionController } from './windowsIntegration';

let mainWindow: BrowserWindow | undefined;
let playbackService: PlaybackService;
let mpvEngine: MpvPlaybackEngine;
let settingsStore: SettingsStore;
let latestSettings: AppSettings;
let isQuitting = false;
const miniShell = createMiniShellState();
const libraryIndexer = new LibraryIndexer();
const libraryWatcher = new LibraryWatcher();
let libraryWatchTimer: NodeJS.Timeout | undefined;
const trayController = new TrayController();
const shortcutController = new ShortcutController();
const windowsMediaSession = new WindowsMediaSessionController();

registerMediaProtocol();

function attachRendererDiagnostics(window: BrowserWindow): void {
  const { webContents } = window;

  webContents.on('did-start-loading', () => {
    console.info('[Virelia main] renderer did-start-loading');
  });

  webContents.on('did-finish-load', () => {
    console.info('[Virelia main] renderer did-finish-load');
  });

  webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[Virelia main] did-fail-load', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame
    });
  });

  webContents.on('render-process-gone', (_event, details) => {
    console.error('[Virelia main] render-process-gone', details);
  });

  webContents.on('unresponsive', () => {
    console.warn('[Virelia main] renderer unresponsive');
  });

  webContents.on('responsive', () => {
    console.info('[Virelia main] renderer responsive again');
  });

  webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const tag = level === 3 ? 'error' : level === 2 ? 'warn' : 'log';
    console[tag === 'log' ? 'info' : tag](`[renderer:${tag}] ${message} (${sourceId}:${line})`);
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 880,
    minHeight: 640,
    title: 'Virelia Prism',
    backgroundColor: '#070711',
    frame: false,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 18, y: 18 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  attachRendererDiagnostics(window);

  const targetUrl = process.env.VITE_DEV_SERVER_URL
    ?? path.join(__dirname, '../renderer/index.html');
  console.info('[Virelia main] loading renderer', targetUrl);

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  window.on('maximize', () => window.webContents.send('prism:window-maximized', true));
  window.on('unmaximize', () => window.webContents.send('prism:window-maximized', false));

  window.on('close', (event) => {
    if (latestSettings.minimizeToTray && !isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  return window;
}

async function reloadPlaybackEngine(settings: AppSettings): Promise<void> {
  mpvEngine.dispose();
  mpvEngine = new MpvPlaybackEngine(settings.playback.mpvPath);
  playbackService = await PlaybackService.create(
    mpvEngine,
    new HtmlFallbackEngine(),
    settings.playback.preferredEngine === 'mpv',
    { volume: settings.playback.volume, speed: settings.playback.speed }
  );
}

async function syncMediaAllowlist(settings: AppSettings): Promise<void> {
  setMediaAllowlist(settings.libraryFolders);
}

async function persistLibraryFolders(folders: string[]): Promise<AppSettings> {
  const settings = await settingsStore.save({ libraryFolders: folders });
  await syncMediaAllowlist(settings);
  libraryWatcher.watchFolders(settings.libraryFolders, () => scheduleLibraryRescan(settings.libraryFolders));
  return settings;
}

function scheduleLibraryRescan(folders: string[]): void {
  if (libraryWatchTimer) clearTimeout(libraryWatchTimer);
  libraryWatchTimer = setTimeout(async () => {
    const scan = await libraryIndexer.scanFolders(folders);
    mainWindow?.webContents.send('prism:library-updated', scan);
  }, 2000);
}

function bindWindow(window: BrowserWindow, settings: AppSettings): void {
  trayController.setWindow(window);
  configureTaskbarControls(window);
  shortcutController.register(window, settings.shortcuts);
  attachWindowLifecycle(window, miniShell);
}

async function registerIpc(): Promise<void> {
  ipcMain.handle('settings:load', () => settingsStore.load());
  ipcMain.handle('settings:save', async (_event, patch: Partial<AppSettings>) => {
    const settings = await settingsStore.save(patch);
    latestSettings = settings;
    await syncMediaAllowlist(settings);
    if (patch.startWithWindows !== undefined) {
      app.setLoginItemSettings({
        openAtLogin: settings.startWithWindows,
        path: process.execPath
      });
    }
    if (mainWindow) shortcutController.register(mainWindow, settings.shortcuts);
    if (patch.playback?.mpvPath !== undefined || patch.playback?.preferredEngine !== undefined) {
      await reloadPlaybackEngine(settings);
    }
    libraryWatcher.watchFolders(settings.libraryFolders, () => scheduleLibraryRescan(settings.libraryFolders));
    return settings;
  });

  ipcMain.handle('library:choose-folder', async () => {
    if (!mainWindow) return undefined;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add media folder to Virelia Prism',
      properties: ['openDirectory', 'multiSelections']
    });
    if (result.canceled) return undefined;
    const current = await settingsStore.load();
    const addedFolders = result.filePaths.filter((folder) => !current.libraryFolders.includes(folder));
    const folders = Array.from(new Set([...current.libraryFolders, ...result.filePaths]));
    await persistLibraryFolders(folders);
    const scan = addedFolders.length > 0
      ? await libraryIndexer.scanFolders(addedFolders)
      : { media: [], scannedAt: new Date().toISOString() };
    return { folders, media: scan.media, scannedAt: scan.scannedAt };
  });

  ipcMain.handle('library:load-cached', async (_event, folders: string[]) => {
    const { readLibraryDiskCacheAsync } = await import('./library/libraryDiskCache');
    return readLibraryDiskCacheAsync(folders);
  });

  ipcMain.handle('library:scan', async (_event, folders: string[]) => {
    const settings = await settingsStore.load();
    const allowed = new Set(settings.libraryFolders);
    const safeFolders = folders.filter((folder) => allowed.has(folder));
    const result = await libraryIndexer.scanFolders(safeFolders);
    writeLibraryDiskCache(result);
    return result;
  });

  ipcMain.handle('library:import-paths', async (_event, filePaths: string[]) => {
    const media = await createMediaItemsFromPaths(filePaths);
    const current = await settingsStore.load();
    const folders = Array.from(new Set([
      ...current.libraryFolders,
      ...media.map((item) => path.dirname(item.filePath))
    ]));
    const foldersChanged = folders.length !== current.libraryFolders.length
      || folders.some((folder) => !current.libraryFolders.includes(folder));
    if (foldersChanged) {
      await persistLibraryFolders(folders);
    } else {
      await syncMediaAllowlist({ ...current, libraryFolders: folders });
    }
    return {
      folders,
      media,
      scannedAt: new Date().toISOString()
    };
  });

  ipcMain.handle('media:url', (_event, filePath: string) => {
    if (!isMediaPathAllowed(filePath)) {
      throw new Error('Media path is not allowed');
    }
    return toMediaProtocolUrl(filePath);
  });

  ipcMain.handle('thumbnails:ffmpeg', async () => locateFfmpeg());

  ipcMain.handle('thumbnails:get', async (_event, mediaId: string, filePath: string, fileName: string, options?: { priority?: number }) => {
    const ffmpeg = await locateFfmpeg();
    const name = fileName || path.basename(filePath);
    const status = getThumbnailStatus(mediaId, filePath, name);
    if (status.status === 'ready' || status.status === 'failed') {
      return { ...status, ffmpegAvailable: ffmpeg.available, ffmpegPath: ffmpeg.path };
    }
    const requested = requestThumbnailGeneration(mediaId, filePath, name, options?.priority ?? 0);
    return { ...requested, ffmpegAvailable: ffmpeg.available, ffmpegPath: ffmpeg.path };
  });

  ipcMain.handle('thumbnails:retry', (_event, mediaId: string, filePath: string, fileName: string) => {
    return retryThumbnail(mediaId, filePath, fileName || path.basename(filePath));
  });

  ipcMain.handle('metadata:read', async (_event, cacheKey: string) => {
    const { readTitleMetadataRecord } = await import('./metadata/metadataCacheService');
    return readTitleMetadataRecord(cacheKey);
  });

  ipcMain.handle('metadata:write', async (_event, record: import('../shared/titleMetadataTypes').TitleMetadataRecord) => {
    const { writeTitleMetadataRecord } = await import('./metadata/metadataCacheService');
    writeTitleMetadataRecord(record);
  });

  ipcMain.handle('metadata:cache-image', async (_event, remoteUrl: string, kind: 'poster' | 'backdrop' | 'banner' | 'screenshot' | 'trailer') => {
    const { cacheMetadataImage } = await import('./metadata/metadataCacheService');
    return cacheMetadataImage(remoteUrl, kind);
  });

  ipcMain.handle('metadata:delete', async (_event, cacheKey: string) => {
    const { deleteTitleMetadataRecord } = await import('./metadata/metadataCacheService');
    deleteTitleMetadataRecord(cacheKey);
  });

  ipcMain.handle('system:locale', () => {
    const preferred =
      typeof app.getPreferredSystemLanguages === 'function'
        ? app.getPreferredSystemLanguages()
        : [];
    return preferred[0] || app.getLocale() || 'en-US';
  });

  ipcMain.handle('playback:status', () => playbackService.refreshEngineStatus());
  ipcMain.handle(
    'playback:play',
    async (
      _event,
      mediaId: string,
      filePath: string,
      options?: { forceEngine?: AppSettings['playback']['preferredEngine']; autoPlay?: boolean }
    ) => playbackService.play(mediaId, filePath, options)
  );
  ipcMain.handle('playback:pause', () => playbackService.pause());
  ipcMain.handle('playback:toggle', () => playbackService.toggle());
  ipcMain.handle('playback:seek', (_event, positionSeconds: number) => {
    if (!Number.isFinite(positionSeconds)) return playbackService.getState();
    return playbackService.seek(positionSeconds);
  });
  ipcMain.handle('playback:volume', (_event, volume: number) => {
    if (!Number.isFinite(volume)) return playbackService.getState();
    return playbackService.setVolume(volume);
  });
  ipcMain.handle('playback:speed', (_event, speed: number) => {
    if (!Number.isFinite(speed)) return playbackService.getState();
    return playbackService.setSpeed(speed);
  });
  ipcMain.handle('playback:set-repeat', (_event, repeat: AppSettings['playback']['repeat']) => playbackService.setRepeat(repeat));
  ipcMain.handle('playback:set-shuffle', (_event, shuffle: boolean) => playbackService.setShuffle(shuffle));
  ipcMain.handle('playback:stop-external', () => playbackService.stopExternalPlayback());
  ipcMain.handle('playback:reload-engine', async () => {
    const settings = await settingsStore.load();
    await reloadPlaybackEngine(settings);
    return playbackService.refreshEngineStatus();
  });

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false;
    if (getShellWindowMode(miniShell) === 'mini') {
      return mainWindow.isMaximized();
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  });
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle('window:is-fullscreen', () => mainWindow?.isFullScreen() ?? false);
  ipcMain.handle('window:close', () => {
    isQuitting = true;
    app.quit();
  });
  ipcMain.handle('window:minimize-to-tray', async () => {
    const settings = await settingsStore.load();
    if (settings.minimizeToTray) mainWindow?.hide();
    else mainWindow?.minimize();
  });
  ipcMain.handle('window:enter-mini', async (_event, options?: { isVideo?: boolean; animate?: boolean }) => {
    if (!mainWindow) return;
    const kind: MiniMediaKind = miniKindFromOptions(options);
    await enterMiniShell(mainWindow, miniShell, kind, { animate: options?.animate });
    mainWindow.webContents.send('prism:mini-player', true);
  });
  ipcMain.handle('window:exit-mini', async (_event, target?: 'restore' | 'library', options?: { animate?: boolean }) => {
    if (!mainWindow) return;
    const reason = target === 'library' ? 'mini-x-to-library' : 'mini-restore';
    await exitMiniShell(mainWindow, miniShell, reason, { animate: options?.animate });
    mainWindow.webContents.send('prism:mini-player', false);
  });
  ipcMain.handle('window:ensure-normal', async (_event, reason?: string) => {
    if (!mainWindow) return;
    const wasMini = getShellWindowMode(miniShell) === 'mini';
    await ensureNormalShell(mainWindow, miniShell, reason ?? 'ipc');
    if (wasMini) mainWindow.webContents.send('prism:mini-player', false);
  });
  ipcMain.handle('window:get-shell-mode', () => getShellWindowMode(miniShell));
  ipcMain.handle('window:toggle-mini-player', async (_event, options?: { isVideo?: boolean; animate?: boolean }) => {
    if (!mainWindow) return;
    if (getShellWindowMode(miniShell) !== 'mini') {
      const kind: MiniMediaKind = miniKindFromOptions(options);
      await enterMiniShell(mainWindow, miniShell, kind, { animate: options?.animate });
      mainWindow.webContents.send('prism:mini-player', true);
      return;
    }
    await exitMiniShell(mainWindow, miniShell);
    mainWindow.webContents.send('prism:mini-player', false);
  });
}

app.whenReady().then(async () => {
  console.info('[Virelia main] app ready');
  installMediaProtocolHandler();
  settingsStore = new SettingsStore(app.getPath('userData'));
  const settings = await settingsStore.load();
  latestSettings = settings;
  await syncMediaAllowlist(settings);
  mpvEngine = new MpvPlaybackEngine(settings.playback.mpvPath);
  playbackService = await PlaybackService.create(
    mpvEngine,
    new HtmlFallbackEngine(),
    settings.playback.preferredEngine === 'mpv',
    { volume: settings.playback.volume, speed: settings.playback.speed }
  );
  await registerIpc();

  app.setLoginItemSettings({
    openAtLogin: settings.startWithWindows,
    path: process.execPath
  });

  mainWindow = createWindow();
  ensureNormalShell(mainWindow, miniShell);
  console.info('[Virelia main] window created');
  trayController.create(mainWindow);
  bindWindow(mainWindow, settings);
  libraryWatcher.watchFolders(settings.libraryFolders, () => {
    void settingsStore.load().then((loaded) => scheduleLibraryRescan(loaded.libraryFolders));
  });
  windowsMediaSession.updateMetadata(undefined, playbackService.state);

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const loaded = await settingsStore.load();
      mainWindow = createWindow();
      trayController.create(mainWindow);
      bindWindow(mainWindow, loaded);
    } else {
      mainWindow?.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  shortcutController.unregister();
  libraryWatcher.close();
  mpvEngine?.dispose();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
