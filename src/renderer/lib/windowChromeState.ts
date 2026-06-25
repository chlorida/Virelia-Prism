import { getPrism } from './prismApi';

export interface WindowChromeState {
  maximized: boolean;
  fullscreen: boolean;
}

export async function readWindowChromeState(): Promise<WindowChromeState> {
  const windowApi = getPrism()?.window;
  if (!windowApi) {
    return { maximized: false, fullscreen: false };
  }
  const [maximized, fullscreen] = await Promise.all([
    windowApi.isMaximized?.() ?? false,
    windowApi.isFullscreen?.() ?? false,
  ]);
  return { maximized, fullscreen };
}

export function usesChromeRestoreFlags(chrome: WindowChromeState): boolean {
  return chrome.maximized || chrome.fullscreen;
}
