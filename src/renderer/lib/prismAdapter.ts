import type { PrismApi } from '../../shared/prismApi.types';
import { createTauriPrismApi } from './tauriPrismApi';
import { getAppInfo } from './tauriCommands';
import { tauriInitWindowShellLifecycle } from './tauriMiniWindow';

export type PrismShell = 'electron' | 'tauri' | 'browser';

export function isTauriShell(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window
    || '__TAURI__' in window
    || import.meta.env.VITE_SHELL === 'tauri';
}

export function isElectronShell(): boolean {
  if (typeof window === 'undefined') return false;
  if (isTauriShell()) return false;
  return typeof window.prism !== 'undefined'
    && !('__PRISM_TAURI_BRIDGE__' in window);
}

export function getPrismShell(): PrismShell {
  if (isElectronShell()) return 'electron';
  if (isTauriShell()) return 'tauri';
  return 'browser';
}

declare global {
  interface Window {
    /** Set by Tauri adapter when Electron preload is absent. */
    __PRISM_TAURI_BRIDGE__?: boolean;
  }
}

let tauriBridgeReady = false;

/**
 * Installs window.prism for Tauri before React mounts.
 * Electron keeps using preload contextBridge.
 */
export async function ensurePrismBridge(): Promise<PrismApi | null> {
  if (isElectronShell()) {
    return window.prism ?? null;
  }

  if (!isTauriShell()) {
    return null;
  }

  if (!window.prism) {
    window.prism = createTauriPrismApi();
    window.__PRISM_TAURI_BRIDGE__ = true;
    tauriBridgeReady = true;
    try {
      const info = await getAppInfo();
      console.info('[Virelia] Tauri shell ready', info);
    } catch (error) {
      console.warn('[Virelia] get_app_info failed', error);
    }
    try {
      await tauriInitWindowShellLifecycle();
    } catch (error) {
      console.warn('[Virelia] window shell lifecycle init failed', error);
    }
  }

  return window.prism;
}

export function isPrismBridgeReady(): boolean {
  if (isElectronShell()) return typeof window.prism !== 'undefined';
  return tauriBridgeReady && typeof window.prism !== 'undefined';
}

export {
  getLibrary as tauriGetLibrary,
  onLibraryChanged as tauriOnLibraryChanged,
  onScanProgress as tauriOnScanProgress,
  scanFolder as tauriScanFolder,
  validateMediaPath as tauriValidateMediaPath
} from './tauriCommands';
