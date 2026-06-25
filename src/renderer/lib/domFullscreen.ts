/**
 * Video fullscreen: Tauri OS setFullscreen on desktop; DOM Fullscreen API in browser.
 */

import { enterPlayerMode, playerModeStore, setVideoTheater } from '../features/ui/playerModeStore';
import { isTauriShell } from './prismAdapter';
import {
  isVideoOsFullscreenSession,
  tauriEnterVideoOsFullscreen,
  tauriExitVideoOsFullscreen,
} from './tauriMiniWindow';

export const IMMERSIVE_VIDEO_CLASS = 'video-shell--immersive';
export const APP_FRAME_VIDEO_FULLSCREEN_CLASS = 'app-frame--video-fullscreen';

/** @deprecated Use IMMERSIVE_VIDEO_CLASS */
export const PSEUDO_FULLSCREEN_CLASS = IMMERSIVE_VIDEO_CLASS;

let immersiveVideoTarget: HTMLElement | null = null;
let theaterBeforeVideoFullscreen: boolean | null = null;
const immersiveVideoListeners = new Set<() => void>();

function setVideoFullscreenChromeActive(active: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('video-dom-fullscreen-active', active);
  document.body.classList.toggle('video-dom-fullscreen-active', active);
}

function setAppFrameVideoFullscreen(active: boolean): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.app-frame').forEach((el) => {
    el.classList.toggle(APP_FRAME_VIDEO_FULLSCREEN_CLASS, active);
  });
}

export { setVideoFullscreenChromeActive };

export function forceClearVideoFullscreenChrome(): void {
  immersiveVideoTarget?.classList.remove(IMMERSIVE_VIDEO_CLASS);
  immersiveVideoTarget = null;
  restoreTheaterAfterVideoFullscreen();
  setVideoFullscreenChromeActive(false);
  setAppFrameVideoFullscreen(false);
  notifyImmersiveVideoChange();
}

function notifyImmersiveVideoChange(): void {
  for (const listener of immersiveVideoListeners) {
    listener();
  }
}

function rememberTheaterForVideoFullscreen(): void {
  if (theaterBeforeVideoFullscreen !== null) return;
  theaterBeforeVideoFullscreen = playerModeStore.getState().videoTheater;
  if (!theaterBeforeVideoFullscreen) {
    setVideoTheater(true);
  }
}

function restoreTheaterAfterVideoFullscreen(): void {
  if (theaterBeforeVideoFullscreen === null) return;
  if (!theaterBeforeVideoFullscreen) {
    setVideoTheater(false);
  }
  theaterBeforeVideoFullscreen = null;
}

export function getFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  return (
    document.fullscreenElement
    ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement
    ?? null
  );
}

export function getPseudoFullscreenTarget(): HTMLElement | null {
  return immersiveVideoTarget;
}

export function isPseudoFullscreenActive(target?: HTMLElement | null): boolean {
  return isImmersiveVideoActive(target);
}

export function isImmersiveVideoActive(target?: HTMLElement | null): boolean {
  if (!immersiveVideoTarget) return false;
  if (!target) return true;
  return (
    immersiveVideoTarget === target
    || immersiveVideoTarget.contains(target)
    || target.contains(immersiveVideoTarget)
  );
}

export function isDomFullscreenActive(target?: HTMLElement | null): boolean {
  const fs = getFullscreenElement();
  if (!fs) return false;
  if (!target) return true;
  return fs === target || target.contains(fs) || fs.contains(target);
}

export function isVideoFullscreenActive(target?: HTMLElement | null): boolean {
  return (
    isVideoOsFullscreenSession()
    || isImmersiveVideoActive(target)
    || isDomFullscreenActive(target ?? null)
  );
}

export function subscribePseudoFullscreen(listener: () => void): () => void {
  immersiveVideoListeners.add(listener);
  return () => {
    immersiveVideoListeners.delete(listener);
  };
}

export function subscribeVideoFullscreen(listener: () => void): () => void {
  const unsubDom = subscribeDomFullscreen(listener);
  const unsubImmersive = subscribePseudoFullscreen(listener);
  return () => {
    unsubDom();
    unsubImmersive();
  };
}

function enterImmersiveChrome(target: HTMLElement): void {
  enterPlayerMode();
  rememberTheaterForVideoFullscreen();
  immersiveVideoTarget = target;
  target.classList.add(IMMERSIVE_VIDEO_CLASS);
  setVideoFullscreenChromeActive(true);
  setAppFrameVideoFullscreen(true);
  notifyImmersiveVideoChange();
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

function exitImmersiveChrome(forceClearChrome = false): void {
  if (immersiveVideoTarget) {
    immersiveVideoTarget.classList.remove(IMMERSIVE_VIDEO_CLASS);
    immersiveVideoTarget = null;
  }
  restoreTheaterAfterVideoFullscreen();
  if (forceClearChrome || !getFullscreenElement()) {
    setVideoFullscreenChromeActive(false);
    setAppFrameVideoFullscreen(false);
  }
  notifyImmersiveVideoChange();
}

async function enterTauriVideoFullscreen(target: HTMLElement): Promise<void> {
  enterImmersiveChrome(target);
  void tauriEnterVideoOsFullscreen().catch((error) => {
    console.warn('[Virelia] OS fullscreen failed; in-app fullscreen remains active', error);
  });
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

async function exitTauriVideoFullscreen(): Promise<void> {
  if (isVideoOsFullscreenSession()) {
    await tauriExitVideoOsFullscreen();
  }
  exitImmersiveChrome(true);
}

export async function enterDomFullscreen(target: HTMLElement): Promise<void> {
  const req =
    target.requestFullscreen
    ?? (target as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
  if (!req) return;
  if (isDomFullscreenActive(target)) return;
  exitImmersiveChrome(true);
  await req.call(target);
  rememberTheaterForVideoFullscreen();
  setVideoFullscreenChromeActive(true);
}

export async function exitDomFullscreen(): Promise<void> {
  if (isTauriShell() && (isVideoOsFullscreenSession() || isImmersiveVideoActive())) {
    await exitTauriVideoFullscreen();
    return;
  }

  if (immersiveVideoTarget || theaterBeforeVideoFullscreen !== null) {
    exitImmersiveChrome(true);
    return;
  }

  const fs = getFullscreenElement();
  if (!fs) {
    forceClearVideoFullscreenChrome();
    return;
  }
  const exit =
    document.exitFullscreen
    ?? (document as Document & { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen;
  if (exit) await exit.call(document);
  forceClearVideoFullscreenChrome();
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => { finished: Promise<void> };
};

async function runWithOptionalViewTransition(run: () => void | Promise<void>): Promise<void> {
  const doc = document as ViewTransitionDocument;
  if (typeof doc.startViewTransition === 'function') {
    await doc.startViewTransition(() => run()).finished;
    return;
  }
  await run();
}

function hasNativeFullscreen(target: HTMLElement): boolean {
  return (
    typeof target.requestFullscreen === 'function'
    || typeof (target as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen === 'function'
  );
}

export async function toggleDomFullscreen(target: HTMLElement): Promise<void> {
  if (isVideoFullscreenActive(target)) {
    await exitDomFullscreen();
    return;
  }

  if (isTauriShell()) {
    await enterTauriVideoFullscreen(target);
    return;
  }

  await runWithOptionalViewTransition(async () => {
    if (hasNativeFullscreen(target)) {
      try {
        await enterDomFullscreen(target);
        if (isDomFullscreenActive(target)) return;
      } catch {
        enterImmersiveChrome(target);
      }
      return;
    }

    enterImmersiveChrome(target);
  });
}

export function subscribeDomFullscreen(listener: () => void): () => void {
  const events = ['fullscreenchange', 'webkitfullscreenchange'] as const;
  for (const event of events) {
    document.addEventListener(event, listener);
  }
  const onOsExit = () => listener();
  if (typeof window !== 'undefined') {
    window.addEventListener('virelia:video-os-fullscreen-external-exit', onOsExit);
  }
  return () => {
    for (const event of events) {
      document.removeEventListener(event, listener);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('virelia:video-os-fullscreen-external-exit', onOsExit);
    }
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('virelia:video-os-fullscreen-external-exit', () => {
    exitImmersiveChrome(true);
  });
}
