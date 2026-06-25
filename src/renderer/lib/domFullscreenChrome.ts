import {
  getFullscreenElement,
  isVideoFullscreenActive,
  setVideoFullscreenChromeActive,
  subscribeVideoFullscreen,
} from './domFullscreen';
import { getPrism } from './prismApi';
import { isVideoOsFullscreenSession } from './tauriMiniWindow';
import { readWindowChromeState } from './windowChromeState';

function syncDomFullscreenBodyClass(): boolean {
  const active = isVideoFullscreenActive();
  setVideoFullscreenChromeActive(active);
  return active;
}

async function recoverShellAfterNativeFullscreen(): Promise<void> {
  if (isVideoFullscreenActive()) return;
  if (isVideoOsFullscreenSession()) return;
  setVideoFullscreenChromeActive(false);
  const chrome = await readWindowChromeState();
  if (chrome.fullscreen || chrome.maximized) return;
  void getPrism()?.window.ensureNormalWindow?.('dom-fullscreen-recover');
}

/** Global video-fullscreen chrome: body class + window bounds recovery after native exit / Alt+Tab. */
export function initDomFullscreenChrome(): () => void {
  let wasActive = syncDomFullscreenBodyClass();
  let wasNative = Boolean(getFullscreenElement());

  const onFullscreenChange = () => {
    const prev = wasActive;
    const prevNative = wasNative;
    wasActive = syncDomFullscreenBodyClass();
    wasNative = Boolean(getFullscreenElement());
    if (prev && !wasActive && prevNative) {
      void recoverShellAfterNativeFullscreen();
      window.setTimeout(() => {
        void recoverShellAfterNativeFullscreen();
      }, 120);
    }
  };

  const onVisible = () => {
    if (document.hidden) return;
    const prevNative = wasNative;
    wasActive = syncDomFullscreenBodyClass();
    wasNative = Boolean(getFullscreenElement());
    if (!wasActive && prevNative) {
      void recoverShellAfterNativeFullscreen();
    }
  };

  const onFocus = () => {
    if (!wasActive && !isVideoFullscreenActive() && wasNative) {
      void recoverShellAfterNativeFullscreen();
    }
  };

  const unsub = subscribeVideoFullscreen(onFullscreenChange);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onFocus);

  return () => {
    unsub();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onFocus);
    setVideoFullscreenChromeActive(false);
  };
}
