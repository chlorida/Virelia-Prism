import { app, BrowserWindow, globalShortcut, Menu, nativeImage, Tray } from 'electron';
import type { MediaItem, PlaybackState, ShortcutMap } from '../shared/types';

const traySvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#A66CFF"/>
      <stop offset="1" stop-color="#FF74C8"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="18" fill="#080713"/>
  <path d="M19 14h22c8 0 13 5 13 12 0 8-6 13-14 13H29v11H19V14Zm10 8v9h10c3 0 5-2 5-5s-2-4-5-4H29Z" fill="url(#g)"/>
</svg>`;

export class TrayController {
  private tray?: Tray;
  private window?: BrowserWindow;

  create(window: BrowserWindow): void {
    this.window = window;
    const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(traySvg).toString('base64')}`);
    this.tray = new Tray(image.resize({ width: 16, height: 16 }));
    this.tray.setToolTip('Virelia Prism');
    this.refreshMenu();
    this.tray.on('double-click', () => this.window?.show());
  }

  setWindow(window: BrowserWindow): void {
    this.window = window;
    this.refreshMenu();
  }

  private refreshMenu(): void {
    if (!this.tray || !this.window) return;
    const window = this.window;
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Virelia Prism', click: () => window.show() },
      { label: 'Mini Player', click: () => window.webContents.send('prism:shortcut', 'miniPlayer') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]));
  }
}

function registerIfAvailable(accelerator: string, handler: () => void): void {
  if (!accelerator || accelerator === 'Space') return;
  try {
    if (!globalShortcut.register(accelerator, handler)) {
      console.warn(`Shortcut not registered: ${accelerator}`);
    }
  } catch (error) {
    console.warn(`Shortcut registration failed for ${accelerator}`, error);
  }
}

export class ShortcutController {
  register(window: BrowserWindow, shortcuts: ShortcutMap): void {
    globalShortcut.unregisterAll();
    registerIfAvailable(shortcuts.globalSearch, () => window.webContents.send('prism:shortcut', 'globalSearch'));
    registerIfAvailable(shortcuts.miniPlayer, () => window.webContents.send('prism:shortcut', 'miniPlayer'));
    registerIfAvailable(shortcuts.settings, () => window.webContents.send('prism:shortcut', 'settings'));
    registerIfAvailable('MediaPlayPause', () => window.webContents.send('prism:shortcut', 'playPause'));
    registerIfAvailable('MediaNextTrack', () => window.webContents.send('prism:shortcut', 'next'));
    registerIfAvailable('MediaPreviousTrack', () => window.webContents.send('prism:shortcut', 'previous'));
  }

  unregister(): void {
    globalShortcut.unregisterAll();
  }
}

export class WindowsMediaSessionController {
  private lastMedia?: MediaItem;
  private lastState?: PlaybackState;

  updateMetadata(media: MediaItem | undefined, state: PlaybackState): void {
    this.lastMedia = media;
    this.lastState = state;
    if (!media?.title) return;
    // Native SMTC module can read cached metadata here when integrated.
  }

  getSnapshot(): { media?: MediaItem; state?: PlaybackState } {
    return { media: this.lastMedia, state: this.lastState };
  }
}

function controlIcon(label: string): Electron.NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#171329"/><text x="16" y="21" text-anchor="middle" font-family="Arial" font-size="10" fill="#F4EEFF">${label}</text></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

export function configureTaskbarControls(window: BrowserWindow): void {
  if (process.platform !== 'win32') return;
  window.setThumbarButtons([
    {
      tooltip: 'Previous',
      icon: controlIcon('PREV'),
      click: () => window.webContents.send('prism:shortcut', 'previous')
    },
    {
      tooltip: 'Play / Pause',
      icon: controlIcon('PLAY'),
      click: () => window.webContents.send('prism:shortcut', 'playPause')
    },
    {
      tooltip: 'Next',
      icon: controlIcon('NEXT'),
      click: () => window.webContents.send('prism:shortcut', 'next')
    }
  ]);
}
