import { APP_SHELL_MIN_HEIGHT, APP_SHELL_MIN_WIDTH } from '../../shared/appShellConstraints';
import { isTauriShell } from './prismApi';
import { getTauriShellWindowMode, isVideoOsFullscreenSession, tauriTryReenterTransientFullscreen } from './tauriMiniWindow';

export async function enforceAppShellWindowConstraints(): Promise<void> {
  if (!isTauriShell()) return;
  if (typeof document !== 'undefined' && document.body.classList.contains('video-dom-fullscreen-active')) {
    return;
  }
  if (isVideoOsFullscreenSession()) return;

  try {
    const { getCurrentWindow, LogicalSize, currentMonitor } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (getTauriShellWindowMode() === 'mini') return;

    if (await tauriTryReenterTransientFullscreen()) return;
    if (await win.isFullscreen()) return;

    const monitor = await currentMonitor();
    const workWidth = monitor?.size.width ?? 0;
    const size = await win.innerSize();
    if (workWidth > 0 && size.width >= workWidth * 0.92) {
      return;
    }

    await win.setMinSize(new LogicalSize(APP_SHELL_MIN_WIDTH, APP_SHELL_MIN_HEIGHT));
    if (size.width < APP_SHELL_MIN_WIDTH || size.height < APP_SHELL_MIN_HEIGHT) {
      await win.setSize(new LogicalSize(
        Math.max(size.width, APP_SHELL_MIN_WIDTH),
        Math.max(size.height, APP_SHELL_MIN_HEIGHT),
      ));
    }
  } catch {
    // Window sizing may be unavailable in this shell build.
  }
}
