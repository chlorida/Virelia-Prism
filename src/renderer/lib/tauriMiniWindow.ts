import {
  computeMiniBounds,
  getMiniWindowSize,
  isMiniLikeBounds,
  workAreaPhysicalToLogical,
  type MiniMediaKind,
  type WindowBounds,
  type WorkAreaRect
} from '../../shared/miniWindowGeometry';
import { APP_SHELL_MIN_HEIGHT, APP_SHELL_MIN_WIDTH } from '../../shared/appShellConstraints';
import {
  isBrokenNormalBoundsForCorrection,
  pickTargetNormalBounds,
  clampBoundsToWorkArea,
  validateNormalBounds
} from '../../shared/normalBoundsValidation';
import {
  captureBoundsCandidate,
  createSavedNormalWindowState,
  pickRestoreBounds,
  type SavedNormalWindowState
} from '../../shared/normalWindowRestore';
import type { ShellWindowMode } from '../../shared/shellWindowTypes';
import { logWindowState, logIgnoredBoundsSave } from '../../shared/windowStateDebug';
import { animateTauriWindowBounds } from './tauriWindowBoundsAnimation';
import { enforceAppShellWindowConstraints } from './enforceAppShellWindowConstraints';
import { miniShellTransitionStore } from '../features/mini/miniShellTransitionStore';
import { exitMiniMode, playerModeStore } from '../features/ui/playerModeStore';

let shellWindowMode: ShellWindowMode = 'normal';
let normalBeforeMini: SavedNormalWindowState = createSavedNormalWindowState();
let lastGoodNormalBounds: WindowBounds | undefined;
let lastMiniKind: MiniMediaKind = 'audio';
let pendingTimers: ReturnType<typeof setTimeout>[] = [];
let lifecycleAttached = false;
let restoringMaximized = false;
let trackedFullscreen = false;
/** Set after mini restores OS fullscreen; cleared once windowed bounds are applied. */
let pendingFullscreenWindowedRestore = false;
function setSuppressMiniChrome(active: boolean): void {
  miniShellTransitionStore.patch({ suppressMiniChrome: active });
}

function setPendingFullscreenRestore(active: boolean): void {
  pendingFullscreenWindowedRestore = active;
  setSuppressMiniChrome(active);
}
/** Windowed bounds to restore after the user leaves OS fullscreen (mini round-trip from fullscreen). */
let fullscreenExitTargetBounds: WindowBounds | undefined;
let chromeSyncInFlight: Promise<void> | null = null;
let chromeSyncQueued = false;
let fullscreenRestoreInFlight = false;
/** Blocks stray mini geometry timers after leaving mini (ms epoch). */
let suppressMiniShellUntil = 0;
/** Window was hidden while priming pre-fullscreen bounds to avoid a mini-sized flash. */
let primeFullscreenHideActive = false;
/** OS dropped fullscreen transiently (e.g. Alt+Tab); re-enter on next focus. */
let transientFullscreenLoss = false;
/** User was in OS fullscreen before a transient drop or blur. */
let wantsOsFullscreen = false;

export function getTauriShellWindowMode(): ShellWindowMode {
  return shellWindowMode;
}

export function isMiniShellSuppressedForRenderer(): boolean {
  return isMiniShellSuppressed();
}

function scheduleTimeout(fn: () => void, ms: number): void {
  const id = setTimeout(() => {
    pendingTimers = pendingTimers.filter((t) => t !== id);
    fn();
  }, ms);
  pendingTimers.push(id);
}

function clearAllTimers(): void {
  for (const id of pendingTimers) clearTimeout(id);
  pendingTimers = [];
}

function cloneSavedState(snap: SavedNormalWindowState): SavedNormalWindowState {
  return {
    wasMaximized: snap.wasMaximized,
    wasFullScreen: snap.wasFullScreen,
    savedAt: snap.savedAt,
    bounds: snap.bounds ? { ...snap.bounds } : undefined
  };
}

function markRestoringMaximized(): void {
  restoringMaximized = true;
  scheduleTimeout(() => {
    restoringMaximized = false;
  }, 200);
}

async function isSkippingBoundsCorrectionTauri(
  win: import('@tauri-apps/api/window').Window
): Promise<boolean> {
  if (restoringMaximized) return true;
  try {
    if (await win.isMaximized()) return true;
  } catch {
    /* ignore */
  }
  return readFullscreen(win);
}

async function getWorkAreaLogical(): Promise<WorkAreaRect | null> {
  const { currentMonitor } = await import('@tauri-apps/api/window');
  const monitor = await currentMonitor();
  if (!monitor?.workArea) return null;
  const physical = {
    x: monitor.workArea.position.x,
    y: monitor.workArea.position.y,
    width: monitor.workArea.size.width,
    height: monitor.workArea.size.height
  };
  return workAreaPhysicalToLogical(physical, monitor.scaleFactor);
}

async function getWindowScaleFactor(): Promise<number> {
  const { currentMonitor } = await import('@tauri-apps/api/window');
  const monitor = await currentMonitor();
  return monitor?.scaleFactor && monitor.scaleFactor > 0 ? monitor.scaleFactor : 1;
}

function toLogicalBounds(
  position: { x: number; y: number },
  size: { width: number; height: number },
  scaleFactor: number
): WindowBounds {
  const scale = scaleFactor > 0 ? scaleFactor : 1;
  return {
    x: Math.round(position.x / scale),
    y: Math.round(position.y / scale),
    width: Math.round(size.width / scale),
    height: Math.round(size.height / scale)
  };
}

async function readOuterBoundsLogical(win: import('@tauri-apps/api/window').Window): Promise<WindowBounds> {
  const scale = await getWindowScaleFactor();
  const position = await win.outerPosition();
  const outerSize = await win.outerSize();
  return toLogicalBounds(position, outerSize, scale);
}

async function readFullscreen(win: import('@tauri-apps/api/window').Window): Promise<boolean> {
  try {
    return await win.isFullscreen();
  } catch {
    return false;
  }
}

function rememberGoodNormalBounds(bounds: WindowBounds, workArea: WorkAreaRect, reason: string): void {
  if (!validateNormalBounds(bounds, workArea)) {
    logIgnoredBoundsSave('invalid for work area', { reason, bounds });
    return;
  }
  lastGoodNormalBounds = { ...bounds };
}

async function tryPersistGoodNormalBounds(
  win: import('@tauri-apps/api/window').Window,
  reason: string
): Promise<void> {
  if (shellWindowMode === 'mini') {
    logIgnoredBoundsSave('shellWindowMode mini', { reason });
    return;
  }
  if (await isSkippingBoundsCorrectionTauri(win)) {
    logWindowState('skippedBoundsCorrectionBecauseMaximized', { reason });
    return;
  }
  const workArea = await getWorkAreaLogical();
  if (!workArea) return;
  const bounds = await readOuterBoundsLogical(win);
  if (isBrokenNormalBoundsForCorrection(bounds, workArea, { restoringMaximized })) {
    logIgnoredBoundsSave('broken normal bounds', { reason, bounds });
    return;
  }
  rememberGoodNormalBounds(bounds, workArea, reason);
}

async function applyNormalShellConstraints(win: import('@tauri-apps/api/window').Window): Promise<void> {
  const { LogicalSize } = await import('@tauri-apps/api/window');
  await win.setAlwaysOnTop(false);
  await win.setResizable(true);
  await win.setMaxSize(null);
  if (await isSkippingBoundsCorrectionTauri(win)) {
    return;
  }
  await win.setMinSize(new LogicalSize(APP_SHELL_MIN_WIDTH, APP_SHELL_MIN_HEIGHT));
}

function markMiniShellSuppressed(ms = 600): void {
  suppressMiniShellUntil = Math.max(suppressMiniShellUntil, Date.now() + ms);
}

function isMiniShellSuppressed(): boolean {
  return Date.now() < suppressMiniShellUntil;
}

async function isWindowFocused(win: import('@tauri-apps/api/window').Window): Promise<boolean> {
  if (typeof win.isFocused !== 'function') return true;
  try {
    return await win.isFocused();
  } catch {
    return true;
  }
}

async function tryHideWindow(win: import('@tauri-apps/api/window').Window): Promise<boolean> {
  if (typeof win.hide !== 'function') return false;
  try {
    await win.hide();
    return true;
  } catch {
    return false;
  }
}

async function tryShowWindow(win: import('@tauri-apps/api/window').Window): Promise<void> {
  if (typeof win.show !== 'function') return;
  try {
    await win.show();
  } catch {
    /* ignore */
  }
}

async function applyNormalSizeConstraints(
  win: import('@tauri-apps/api/window').Window
): Promise<void> {
  const { LogicalSize } = await import('@tauri-apps/api/window');
  const constraints = {
    minWidth: APP_SHELL_MIN_WIDTH,
    minHeight: APP_SHELL_MIN_HEIGHT,
    maxWidth: 10000,
    maxHeight: 10000,
  };
  if (typeof win.setSizeConstraints === 'function') {
    await win.setSizeConstraints(constraints);
  }
  await win.setMinSize(new LogicalSize(APP_SHELL_MIN_WIDTH, APP_SHELL_MIN_HEIGHT));
  await win.setMaxSize(new LogicalSize(10000, 10000));
}

/** Clears mini-player lock so maximize/fullscreen can take over (matches Electron shell). */
async function releaseMiniShellConstraints(win: import('@tauri-apps/api/window').Window): Promise<void> {
  await win.setAlwaysOnTop(false);
  await win.setResizable(true);
  await applyNormalSizeConstraints(win);
}

async function applyBounds(
  win: import('@tauri-apps/api/window').Window,
  bounds: WindowBounds
): Promise<void> {
  const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/window');
  await win.setSize(new LogicalSize(bounds.width, bounds.height));
  await win.setPosition(new LogicalPosition(bounds.x, bounds.y));
}

async function applyMiniGeometry(
  win: import('@tauri-apps/api/window').Window,
  kind: MiniMediaKind
): Promise<WindowBounds | null> {
  if (shellWindowMode !== 'mini' || isMiniShellSuppressed()) {
    if (shellWindowMode !== 'mini') {
      console.warn('[window-state] applyMiniGeometry skipped: shellWindowMode is not mini');
    }
    return null;
  }

  const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/window');
  const size = getMiniWindowSize(kind);
  const workArea = await getWorkAreaLogical();

  await win.setAlwaysOnTop(true);
  await win.setResizable(false);
  await win.setMinSize(new LogicalSize(size.width, size.height));
  await win.setMaxSize(new LogicalSize(size.width, size.height));
  await win.setSize(new LogicalSize(size.width, size.height));

  if (workArea) {
    const bounds = computeMiniBounds(workArea, size);
    await win.setPosition(new LogicalPosition(bounds.x, bounds.y));
    lastMiniKind = kind;
    return bounds;
  }
  lastMiniKind = kind;
  return null;
}

async function captureNormalWindowState(win: import('@tauri-apps/api/window').Window): Promise<void> {
  if (shellWindowMode === 'mini') return;

  const snap = normalBeforeMini;
  const workArea = await getWorkAreaLogical();
  const actualBefore = await readOuterBoundsLogical(win);
  snap.wasMaximized = await win.isMaximized();
  snap.wasFullScreen = await readFullscreen(win);
  snap.savedAt = Date.now();

  if (workArea && !snap.wasMaximized && !snap.wasFullScreen) {
    const pre = captureBoundsCandidate(actualBefore, false, false, workArea);
    if (pre) rememberGoodNormalBounds(pre, workArea, 'enter-mini-pre');
  }

  if (snap.wasFullScreen && workArea && lastGoodNormalBounds && validateNormalBounds(lastGoodNormalBounds, workArea)) {
    fullscreenExitTargetBounds = { ...lastGoodNormalBounds };
  }

  if (snap.wasFullScreen) {
    try {
      await win.setFullscreen(false);
      trackedFullscreen = false;
    } catch (error) {
      console.warn('[Virelia] setFullscreen(false) before mini failed; keeping fullscreen restore flag.', error);
    }
  }
  if (snap.wasMaximized) await win.unmaximize();

  const afterMutation = await readOuterBoundsLogical(win);
  const restoredCandidate = captureBoundsCandidate(afterMutation, false, false, workArea ?? undefined);
  if (restoredCandidate && workArea) {
    rememberGoodNormalBounds(restoredCandidate, workArea, 'enter-mini-restored');
    if (snap.wasFullScreen || snap.wasMaximized) {
      fullscreenExitTargetBounds = { ...restoredCandidate };
    }
  }

  let candidate: WindowBounds | undefined;
  if (!snap.wasMaximized && !snap.wasFullScreen) {
    candidate = restoredCandidate
      ?? captureBoundsCandidate(actualBefore, false, false, workArea ?? undefined);
    if (!candidate && workArea) {
      const clamped = clampBoundsToWorkArea(actualBefore, workArea);
      if (!isMiniLikeBounds(clamped) && validateNormalBounds(clamped, workArea)) {
        candidate = clamped;
      }
    }
    if (candidate && workArea) rememberGoodNormalBounds(candidate, workArea, 'enter-mini-capture');
  }

  snap.bounds = snap.wasMaximized || snap.wasFullScreen ? undefined : candidate;

  const restoreViewport = snap.bounds
    ? { width: snap.bounds.width, height: snap.bounds.height }
    : lastGoodNormalBounds
      ? { width: lastGoodNormalBounds.width, height: lastGoodNormalBounds.height }
      : null;

  miniShellTransitionStore.patch({
    restoreWasMaximized: snap.wasMaximized,
    restoreWasFullScreen: snap.wasFullScreen,
    restoreViewport,
  });

  logWindowState('saveBeforeMini', {
    actualBounds: actualBefore,
    wasMaximized: snap.wasMaximized,
    wasFullscreen: snap.wasFullScreen,
    savedNormalBounds: snap.bounds,
    restoredCandidate,
    shellWindowMode
  });
}

function scheduleVerifyNormalBoundsTauri(
  win: import('@tauri-apps/api/window').Window,
  workArea: WorkAreaRect,
  targetBounds: WindowBounds,
  usedFallback: boolean
): void {
  scheduleTimeout(() => {
    void (async () => {
      if (shellWindowMode !== 'normal' || (await isSkippingBoundsCorrectionTauri(win))) {
        if (await win.isMaximized()) {
          logWindowState('skippedBoundsCorrectionBecauseMaximized', { phase: 'post-normal-verify' });
        }
        return;
      }
      const actual = await readOuterBoundsLogical(win);
      if (isBrokenNormalBoundsForCorrection(actual, workArea, { restoringMaximized })) {
        const recovery = pickTargetNormalBounds(workArea, undefined, lastGoodNormalBounds);
        await applyBounds(win, recovery.bounds);
        console.error('[window-state] normal restore failed: still mini-sized or offscreen', {
          actual,
          recovery: recovery.bounds,
          usedFallback
        });
        return;
      }
      await applyNormalShellConstraints(win);
      if (!usedFallback && validateNormalBounds(targetBounds, workArea)) {
        rememberGoodNormalBounds(await readOuterBoundsLogical(win), workArea, 'force-normal-verify');
      }
    })();
  }, 50);
}

async function restoreMaximizedFromMiniTauri(
  win: import('@tauri-apps/api/window').Window,
  reason: string
): Promise<void> {
  const before = await readOuterBoundsLogical(win);
  markRestoringMaximized();
  shellWindowMode = 'normal';

  if (await readFullscreen(win)) {
    try {
      await win.setFullscreen(false);
    } catch {
      /* ignore */
    }
  }

  await win.setAlwaysOnTop(false);
  await win.setResizable(true);
  const { LogicalSize } = await import('@tauri-apps/api/window');
  await win.setMaxSize(null);
  await win.maximize();

  logWindowState('restoreMaximizedFromMini', {
    reason,
    before,
    constraintsCleared: true,
    maximizeCalled: true,
    after: await readOuterBoundsLogical(win),
    isMaximized: await win.isMaximized()
  });

  scheduleTimeout(() => {
    void (async () => {
      if (shellWindowMode !== 'normal') return;
      if (!(await win.isMaximized())) {
        await win.maximize();
        logWindowState('restoreMaximizedFromMini', {
          reason,
          retryMaximize: true,
          after: await readOuterBoundsLogical(win),
          isMaximized: await win.isMaximized()
        });
      }
    })();
  }, 80);
}

async function restoreNormalFromMiniTauri(
  win: import('@tauri-apps/api/window').Window,
  snap: SavedNormalWindowState,
  workArea: WorkAreaRect,
  reason: string
): Promise<void> {
  const restored = pickRestoreBounds(snap, workArea);
  const pick = restored
    ? { bounds: restored, usedFallback: false, source: 'savedNormal' as const }
    : pickTargetNormalBounds(workArea, snap.bounds, lastGoodNormalBounds);
  if (await readFullscreen(win)) {
    try {
      await win.setFullscreen(false);
    } catch {
      /* ignore */
    }
  }
  await applyBounds(win, pick.bounds);
  logWindowState('forceNormal applied', {
    reason,
    targetBounds: pick.bounds,
    actualAfter: await readOuterBoundsLogical(win),
    usedFallback: pick.usedFallback,
    source: pick.source,
    action: 'normal-bounds'
  });
  if (!pick.usedFallback) rememberGoodNormalBounds(pick.bounds, workArea, reason);
  fullscreenExitTargetBounds = { ...pick.bounds };
  scheduleVerifyNormalBoundsTauri(win, workArea, pick.bounds, pick.usedFallback);
}

export async function forceNormalWindowStateTauri(
  win: import('@tauri-apps/api/window').Window,
  reason: string,
  savedForRestore?: SavedNormalWindowState
): Promise<void> {
  clearAllTimers();
  const actualBefore = await readOuterBoundsLogical(win);
  const workArea = (await getWorkAreaLogical()) ?? { x: 0, y: 0, width: 1920, height: 1040 };
  const snap = savedForRestore ?? normalBeforeMini;

  logWindowState('forceNormal start', {
    reason,
    shellWindowMode,
    savedNormalBounds: snap.bounds,
    lastGoodNormalBounds,
    actualBefore,
    workArea,
    wasMaximized: snap.wasMaximized,
    wasFullscreen: snap.wasFullScreen
  });

  shellWindowMode = 'normal';

  if (snap.wasFullScreen) {
    await releaseMiniShellConstraints(win);
    const target = await primeFullscreenRestoreRect(win, workArea, reason);
    try {
      await win.setFullscreen(true);
      trackedFullscreen = true;
      setPendingFullscreenRestore(true);
      scheduleFullscreenExitSafetyPoll(win);
    } catch {
      console.warn('[Virelia] Tauri setFullscreen unavailable.');
      if (primeFullscreenHideActive) {
        await tryShowWindow(win);
        primeFullscreenHideActive = false;
      }
    }
    if (primeFullscreenHideActive) {
      await tryShowWindow(win);
      primeFullscreenHideActive = false;
    }
    logWindowState('forceNormal applied', {
      targetBounds: target,
      actualAfter: await readOuterBoundsLogical(win),
      usedFallback: false,
      action: 'fullscreen'
    });
    return;
  }

  await applyNormalShellConstraints(win);

  if (snap.wasMaximized) {
    await restoreMaximizedFromMiniTauri(win, reason);
    return;
  }

  await restoreNormalFromMiniTauri(win, snap, workArea, reason);
}

function scheduleMiniGeometryReapply(win: import('@tauri-apps/api/window').Window, kind: MiniMediaKind): void {
  const run = () => {
    if (shellWindowMode !== 'mini') return;
    void applyMiniGeometry(win, kind);
  };
  scheduleTimeout(run, 0);
  scheduleTimeout(run, 100);
}

async function ensureMiniShellGeometry(win: import('@tauri-apps/api/window').Window): Promise<void> {
  if (shellWindowMode !== 'mini') {
    console.warn('[window-state] ensureMiniShellGeometry skipped: not in mini shell mode');
    return;
  }
  await applyMiniGeometry(win, lastMiniKind);
}

function pickFullscreenWindowedTarget(workArea: WorkAreaRect): WindowBounds {
  const savedTarget = fullscreenExitTargetBounds;
  if (savedTarget && validateNormalBounds(savedTarget, workArea)) {
    return clampBoundsToWorkArea(savedTarget, workArea);
  }
  return pickTargetNormalBounds(workArea, undefined, lastGoodNormalBounds).bounds;
}

async function primeFullscreenRestoreRect(
  win: import('@tauri-apps/api/window').Window,
  workArea: WorkAreaRect,
  reason: string
): Promise<WindowBounds> {
  const target = pickFullscreenWindowedTarget(workArea);
  await releaseMiniShellConstraints(win);
  fullscreenExitTargetBounds = { ...target };
  primeFullscreenHideActive = await tryHideWindow(win);
  try {
    await applyBounds(win, target);
    rememberGoodNormalBounds(target, workArea, `pre-fullscreen-${reason}`);
  } catch (error) {
    if (primeFullscreenHideActive) {
      await tryShowWindow(win);
      primeFullscreenHideActive = false;
    }
    throw error;
  }
  logWindowState('primeFullscreenRestoreRect', {
    reason,
    targetBounds: target,
    hidden: primeFullscreenHideActive,
  });
  return target;
}

function canCompletePendingFullscreenRestore(actual: WindowBounds, workArea: WorkAreaRect): boolean {
  if (isMiniLikeBounds(actual)) return false;

  const target = fullscreenExitTargetBounds;
  if (!target || !validateNormalBounds(target, workArea)) return false;

  const expected = clampBoundsToWorkArea(target, workArea);
  const sizeTolerance = 32;
  const positionTolerance = 64;
  return Math.abs(actual.width - expected.width) <= sizeTolerance
    && Math.abs(actual.height - expected.height) <= sizeTolerance
    && Math.abs(actual.x - expected.x) <= positionTolerance
    && Math.abs(actual.y - expected.y) <= positionTolerance;
}

function ensureRendererLeftMiniMode(): void {
  if (playerModeStore.getState().mode === 'mini') {
    exitMiniMode();
  }
}

async function restoreWindowedBoundsAfterFullscreen(
  win: import('@tauri-apps/api/window').Window,
  reason: string,
  options?: { force?: boolean }
): Promise<void> {
  if (shellWindowMode === 'mini') return;
  if (fullscreenRestoreInFlight) return;

  const workArea = await getWorkAreaLogical();
  if (!workArea) return;
  if (await win.isMaximized()) return;

  const actual = await readOuterBoundsLogical(win);
  const savedTarget = fullscreenExitTargetBounds;
  const pick = savedTarget && validateNormalBounds(savedTarget, workArea)
    ? { bounds: clampBoundsToWorkArea(savedTarget, workArea), usedFallback: false, source: 'fullscreen-exit-target' as const }
    : pickTargetNormalBounds(workArea, undefined, lastGoodNormalBounds);

  const needsCorrection =
    options?.force === true
    || isBrokenNormalBoundsForCorrection(actual, workArea, { restoringMaximized })
    || isMiniLikeBounds(actual)
    || !validateNormalBounds(actual, workArea);

  if (!needsCorrection) {
    await applyNormalShellConstraints(win);
    rememberGoodNormalBounds(actual, workArea, reason);
    fullscreenExitTargetBounds = undefined;
    setPendingFullscreenRestore(false);
    ensureRendererLeftMiniMode();
    return;
  }

  fullscreenRestoreInFlight = true;
  try {
    await releaseMiniShellConstraints(win);
    const hidden = await tryHideWindow(win);
    try {
      await applyBounds(win, pick.bounds);
    } finally {
      if (hidden) {
        await tryShowWindow(win);
      }
    }
    rememberGoodNormalBounds(pick.bounds, workArea, `fullscreen-exit-${reason}`);
    fullscreenExitTargetBounds = undefined;
    setPendingFullscreenRestore(false);

    logWindowState('fullscreenExitRestore', {
      reason,
      targetBounds: pick.bounds,
      actualBefore: actual,
      actualAfter: await readOuterBoundsLogical(win),
      source: pick.source,
      usedFallback: pick.usedFallback,
      forced: options?.force === true,
    });

    scheduleVerifyNormalBoundsTauri(win, workArea, pick.bounds, pick.usedFallback);
    ensureRendererLeftMiniMode();
    dispatchShellRestored();
  } finally {
    fullscreenRestoreInFlight = false;
  }
}

async function maybeFixMiniSizedNormalShell(
  win: import('@tauri-apps/api/window').Window,
  reason: string
): Promise<boolean> {
  if (transientFullscreenLoss) return false;

  if (shellWindowMode !== 'mini') {
    if (await readFullscreen(win) || await win.isMaximized()) return false;

    const workArea = await getWorkAreaLogical();
    if (!workArea) return false;

    const actual = await readOuterBoundsLogical(win);
    if (
      !isMiniLikeBounds(actual)
      && !isBrokenNormalBoundsForCorrection(actual, workArea, { restoringMaximized })
    ) {
      return false;
    }

    await restoreWindowedBoundsAfterFullscreen(win, reason);
    return true;
  }
  return false;
}

function dispatchShellRestored(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('prism:shell-restored'));
}

function scheduleFullscreenExitRestoreAttempts(win: import('@tauri-apps/api/window').Window): void {
  for (const ms of [0, 32, 96, 200, 400]) {
    scheduleTimeout(() => {
      if (!pendingFullscreenWindowedRestore) return;
      void restoreWindowedBoundsAfterFullscreen(win, `fullscreen-attempt-${ms}`).catch((error) => {
        console.warn('[Virelia] fullscreen restore attempt failed', error);
      });
    }, ms);
  }
}

function scheduleFullscreenExitSafetyPoll(win: import('@tauri-apps/api/window').Window): void {
  scheduleTimeout(() => {
    if (!pendingFullscreenWindowedRestore) return;
    void runChromeSync(win, 'fullscreen-safety-poll').catch((error) => {
      console.warn('[Virelia] fullscreen safety poll failed', error);
    });
  }, 150);
}

async function runChromeSync(
  win: import('@tauri-apps/api/window').Window,
  source: string
): Promise<void> {
  if (chromeSyncInFlight) {
    chromeSyncQueued = true;
    await chromeSyncInFlight;
    if (!chromeSyncQueued) return;
    chromeSyncQueued = false;
  }

  chromeSyncInFlight = syncWindowChromeState(win, source).finally(() => {
    chromeSyncInFlight = null;
    if (chromeSyncQueued) {
      chromeSyncQueued = false;
      void runChromeSync(win, 'queued').catch((error) => {
        console.warn('[Virelia] queued chrome sync failed', error);
      });
    }
  });
  await chromeSyncInFlight;
}

async function maybeReenterTransientFullscreen(
  win: import('@tauri-apps/api/window').Window,
  source: string
): Promise<boolean> {
  if (!transientFullscreenLoss || shellWindowMode === 'mini') return false;
  if (await readFullscreen(win)) {
    transientFullscreenLoss = false;
    trackedFullscreen = true;
    return true;
  }

  transientFullscreenLoss = false;
  try {
    await win.setFullscreen(true);
    trackedFullscreen = true;
    logWindowState('transientFullscreenReenter', { source, pendingFullscreenWindowedRestore });
    return true;
  } catch (error) {
    console.warn('[Virelia] transient fullscreen re-enter failed', error);
    return false;
  }
}

async function onShellVisibilityHidden(win: import('@tauri-apps/api/window').Window): Promise<void> {
  if (shellWindowMode === 'mini') return;
  if (trackedFullscreen || wantsOsFullscreen || await readFullscreen(win)) {
    transientFullscreenLoss = true;
  }
}

async function syncWindowChromeState(
  win: import('@tauri-apps/api/window').Window,
  source: string
): Promise<void> {
  if (videoOsFullscreenExitInFlight) return;
  const fullscreen = await readFullscreen(win);
  const leavingFullscreen = trackedFullscreen && !fullscreen;
  trackedFullscreen = fullscreen;

  if (shellWindowMode === 'mini') {
    return;
  }

  if (fullscreen) {
    wantsOsFullscreen = true;
    transientFullscreenLoss = false;
    return;
  }

  if (transientFullscreenLoss && !pendingFullscreenWindowedRestore) {
    return;
  }

  if (leavingFullscreen && !pendingFullscreenWindowedRestore) {
    if (videoOsFullscreenActive) {
      videoOsFullscreenActive = false;
      videoOsRestore = null;
      if (typeof window !== 'undefined' && !isImmersiveVideoFullscreenChrome()) {
        window.dispatchEvent(new CustomEvent('virelia:video-os-fullscreen-external-exit'));
      }
    }
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (transientFullscreenLoss || hidden || !(await isWindowFocused(win))) {
      transientFullscreenLoss = true;
      return;
    }
    wantsOsFullscreen = false;
  }

  if (pendingFullscreenWindowedRestore) {
    if (!(await isWindowFocused(win))) {
      transientFullscreenLoss = true;
      return;
    }

    let exitHideActive = false;
    exitHideActive = await tryHideWindow(win);
    scheduleFullscreenExitRestoreAttempts(win);

    const workArea = await getWorkAreaLogical();
    if (workArea) {
      const actual = await readOuterBoundsLogical(win);
      if (canCompletePendingFullscreenRestore(actual, workArea)) {
        setPendingFullscreenRestore(false);
        await applyNormalShellConstraints(win);
        rememberGoodNormalBounds(actual, workArea, source);
        ensureRendererLeftMiniMode();
        if (exitHideActive) {
          await tryShowWindow(win);
        }
        return;
      }
    }

    await restoreWindowedBoundsAfterFullscreen(win, source);
    return;
  }

  if (await maybeFixMiniSizedNormalShell(win, source)) {
    return;
  }

  await tryPersistGoodNormalBounds(win, source);
}

async function handleNativeShow(win: import('@tauri-apps/api/window').Window, source: string): Promise<void> {
  if (shouldSkipShellChromeWork()) return;

  if (await maybeReenterTransientFullscreen(win, source)) {
    return;
  }

  if (transientFullscreenLoss) {
    return;
  }

  const actual = await readOuterBoundsLogical(win);
  logWindowState('nativeRestore', { source, shellWindowMode, actualBounds: actual });

  if (shellWindowMode === 'mini') {
    if (!isMiniShellSuppressed()) {
      await ensureMiniShellGeometry(win);
    }
    return;
  }

  if (await isSkippingBoundsCorrectionTauri(win)) {
    logWindowState('skippedBoundsCorrectionBecauseMaximized', { source });
    return;
  }

  if (await maybeFixMiniSizedNormalShell(win, source)) {
    return;
  }

  const workArea = await getWorkAreaLogical();
  if (workArea && isBrokenNormalBoundsForCorrection(actual, workArea, { restoringMaximized })) {
    await restoreWindowedBoundsAfterFullscreen(win, `native-${source}`);
  } else {
    await applyNormalShellConstraints(win);
    if (workArea) rememberGoodNormalBounds(actual, workArea, source);
  }
}

async function attachTauriLifecycle(win: import('@tauri-apps/api/window').Window): Promise<void> {
  if (lifecycleAttached) return;
  if (typeof window === 'undefined') return;
  lifecycleAttached = true;
  trackedFullscreen = await readFullscreen(win);
  wantsOsFullscreen = trackedFullscreen;

  const { listen } = await import('@tauri-apps/api/event');
  await listen('tauri://resize', () => {
    if (shouldSkipShellChromeWork()) return;
    void runChromeSync(win, 'resize').catch((error) => {
      console.warn('[Virelia] resize chrome sync failed', error);
    });
  });
  await listen('tauri://move', () => {
    if (shouldSkipShellChromeWork()) return;
    void tryPersistGoodNormalBounds(win, 'move');
  });
  await listen('tauri://window-focus', () => {
    scheduleHandleNativeShow(win, 'focus');
  });
  await listen('tauri://blur', () => {
    void onShellVisibilityHidden(win);
  });
  await listen('tauri://focus', () => {
    scheduleHandleNativeShow(win, 'tauri-focus');
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        void onShellVisibilityHidden(win);
      } else {
        scheduleHandleNativeShow(win, 'visibility');
      }
    });
  }

  if (typeof win.onFocusChanged === 'function') {
    await win.onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        void onShellVisibilityHidden(win);
      } else {
        scheduleHandleNativeShow(win, 'focus-changed');
      }
    });
  }
  // Blur/visibility: Alt+Tab transiently drops OS fullscreen on Windows.

  if (typeof win.onResized === 'function') {
    await win.onResized(() => {
      if (shouldSkipShellChromeWork()) return;
      void runChromeSync(win, 'onResized').catch((error) => {
        console.warn('[Virelia] onResized chrome sync failed', error);
      });
    });
  }
}

/** Re-enter OS fullscreen after Alt+Tab transient drop (no-op when not applicable). */
export async function tauriTryReenterTransientFullscreen(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return maybeReenterTransientFullscreen(getCurrentWindow(), 'external');
}

/** Focus handler: restore transient fullscreen before applying shell min-size constraints. */
export function tauriHandleShellFocus(): void {
  if (typeof window === 'undefined') return;
  if (shouldSkipShellChromeWork()) return;
  if (shellFocusDebounceTimer) {
    window.clearTimeout(shellFocusDebounceTimer);
  }
  shellFocusDebounceTimer = window.setTimeout(() => {
    shellFocusDebounceTimer = null;
    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      if (await maybeReenterTransientFullscreen(win, 'shell-focus')) return;
      await enforceAppShellWindowConstraints();
    })().catch((error) => {
      console.warn('[Virelia] shell focus handler failed', error);
    });
  }, 80);
}

/** Ensure the main window is visible after cold start (release builds). */
export async function tauriEnsureMainWindowVisible(): Promise<void> {
  if (typeof window === 'undefined') return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  await win.show();
  if (await win.isMinimized()) {
    await win.unminimize();
  }
  await win.setFocus().catch(() => undefined);
}

/** Attach resize/fullscreen lifecycle as early as possible (not only on first mini enter). */
export async function tauriInitWindowShellLifecycle(): Promise<void> {
  if (typeof window === 'undefined') return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  await tauriEnsureMainWindowVisible();
  await attachTauriLifecycle(win);
}

export async function tauriEnterMiniWindow(
  isVideo: boolean,
  options?: { animate?: boolean }
): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  const kind: MiniMediaKind = isVideo ? 'video' : 'audio';
  const shellBefore = shellWindowMode;
  const actualBefore = await readOuterBoundsLogical(win);
  const animate = options?.animate !== false;

  await attachTauriLifecycle(win);

  if (shellWindowMode !== 'mini') {
    await captureNormalWindowState(win);
    shellWindowMode = 'mini';
  }

  const size = getMiniWindowSize(kind);
  const workArea = await getWorkAreaLogical();
  const from = await readOuterBoundsLogical(win);
  const to = workArea
    ? computeMiniBounds(workArea, size)
    : { x: from.x, y: from.y, width: size.width, height: size.height };

  const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/window');

  await win.setAlwaysOnTop(true);
  await win.setResizable(true);
  await win.setMinSize(new LogicalSize(200, 160));
  await win.setMaxSize(new LogicalSize(10000, 10000));

  await animateTauriWindowBounds(win, from, to, { instant: !animate });

  await win.setResizable(false);
  await win.setMinSize(new LogicalSize(size.width, size.height));
  await win.setMaxSize(new LogicalSize(size.width, size.height));
  await win.setSize(new LogicalSize(size.width, size.height));
  if (workArea) {
    const finalBounds = computeMiniBounds(workArea, size);
    await win.setPosition(new LogicalPosition(finalBounds.x, finalBounds.y));
  }
  lastMiniKind = kind;

  if (!animate) {
    scheduleMiniGeometryReapply(win, kind);
  }

  logWindowState('enterMini', {
    shellWindowModeBefore: shellBefore,
    savedNormalState: cloneSavedState(normalBeforeMini),
    targetMiniBounds: to,
    actualAfter: await readOuterBoundsLogical(win),
    actualBefore,
    animated: animate
  });
}

export async function tauriExitMiniWindow(
  reason = 'mini-restore',
  options?: { animate?: boolean }
): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  clearAllTimers();
  markMiniShellSuppressed();
  const snap = cloneSavedState(normalBeforeMini);
  const actualBefore = await readOuterBoundsLogical(win);
  const animate = options?.animate !== false;

  if (snap.wasFullScreen) {
    setSuppressMiniChrome(true);
    shellWindowMode = 'normal';
    normalBeforeMini = createSavedNormalWindowState();
    ensureRendererLeftMiniMode();
    await forceNormalWindowStateTauri(win, reason, snap);
    logWindowState('exitMini', { reason, action: 'fullscreen-restore', actualBefore });
    return;
  }

  if (snap.wasMaximized) {
    shellWindowMode = 'normal';
    normalBeforeMini = createSavedNormalWindowState();
    ensureRendererLeftMiniMode();
    await restoreMaximizedFromMiniTauri(win, reason);
    logWindowState('exitMini', { reason, action: 'maximize-restore', actualBefore });
    return;
  }

  const workArea = (await getWorkAreaLogical()) ?? { x: 0, y: 0, width: 1920, height: 1040 };
  const from = await readOuterBoundsLogical(win);
  const restored = pickRestoreBounds(snap, workArea);
  const pick = restored
    ? { bounds: restored, usedFallback: false, source: 'savedNormal' as const }
    : pickTargetNormalBounds(workArea, snap.bounds, lastGoodNormalBounds);

  await win.setAlwaysOnTop(false);
  await applyNormalShellConstraints(win);

  await animateTauriWindowBounds(win, from, pick.bounds, { instant: !animate });

  shellWindowMode = 'normal';
  normalBeforeMini = createSavedNormalWindowState();
  ensureRendererLeftMiniMode();
  await applyNormalShellConstraints(win);

  logWindowState('exitMini', {
    reason,
    savedNormalState: snap,
    actualBefore,
    actualAfter: await readOuterBoundsLogical(win),
    animated: animate
  });

  if (!pick.usedFallback) rememberGoodNormalBounds(pick.bounds, workArea, reason);
  fullscreenExitTargetBounds = { ...pick.bounds };
  scheduleVerifyNormalBoundsTauri(win, workArea, pick.bounds, pick.usedFallback);
}

export async function tauriEnsureNormalWindow(reason = 'ensure-normal'): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();

  if (shellWindowMode === 'mini') {
    await tauriExitMiniWindow(reason);
    return;
  }

  const workArea = await getWorkAreaLogical();
  if (!workArea) {
    if (!(await isSkippingBoundsCorrectionTauri(win))) {
      await applyNormalShellConstraints(win);
    }
    return;
  }

  if (await isSkippingBoundsCorrectionTauri(win)) {
    shellWindowMode = 'normal';
    logWindowState('skippedBoundsCorrectionBecauseMaximized', { reason });
    return;
  }

  const actual = await readOuterBoundsLogical(win);
  if (isBrokenNormalBoundsForCorrection(actual, workArea, { restoringMaximized })) {
    await forceNormalWindowStateTauri(win, reason);
    return;
  }

  shellWindowMode = 'normal';
  await applyNormalShellConstraints(win);
  rememberGoodNormalBounds(actual, workArea, reason);
}

export async function tauriToggleMiniPlayer(isVideo: boolean): Promise<boolean> {
  if (shellWindowMode !== 'mini') {
    await tauriEnterMiniWindow(isVideo);
    return true;
  }
  await tauriExitMiniWindow('toggle');
  return false;
}

interface VideoOsFullscreenRestore {
  wasFullscreen: boolean;
  wasMaximized: boolean;
  bounds?: WindowBounds;
}

let videoOsFullscreenActive = false;
let videoOsRestore: VideoOsFullscreenRestore | null = null;
let videoOsFullscreenExitInFlight = false;
let nativeShowDebounceTimer: number | null = null;
let shellFocusDebounceTimer: number | null = null;

function isImmersiveVideoFullscreenChrome(): boolean {
  return typeof document !== 'undefined'
    && document.body.classList.contains('video-dom-fullscreen-active');
}

function shouldSkipShellChromeWork(): boolean {
  return videoOsFullscreenActive || isImmersiveVideoFullscreenChrome();
}

function scheduleHandleNativeShow(
  win: import('@tauri-apps/api/window').Window,
  source: string,
  delayMs = 64
): void {
  if (shouldSkipShellChromeWork()) return;
  if (nativeShowDebounceTimer) {
    window.clearTimeout(nativeShowDebounceTimer);
  }
  nativeShowDebounceTimer = window.setTimeout(() => {
    nativeShowDebounceTimer = null;
    void handleNativeShow(win, source).catch((error) => {
      console.warn('[Virelia] handleNativeShow failed', error);
    });
  }, delayMs);
}

export function isVideoOsFullscreenSession(): boolean {
  return videoOsFullscreenActive;
}

export function isVideoOsFullscreenExitInFlight(): boolean {
  return videoOsFullscreenExitInFlight;
}

async function waitForOsFullscreen(
  win: import('@tauri-apps/api/window').Window,
  attempts = 4,
  delayMs = 16
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (await win.isFullscreen()) return true;
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }
  return false;
}

/** OS fullscreen for the video player button (Tauri setFullscreen — hides taskbar on Windows). */
export async function tauriEnterVideoOsFullscreen(): Promise<boolean> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();

  const wasFullscreen = await win.isFullscreen();
  const wasMaximized = await win.isMaximized();
  const bounds = !wasFullscreen && !wasMaximized
    ? await readOuterBoundsLogical(win)
    : undefined;

  if (wasFullscreen) {
    videoOsRestore = { wasFullscreen, wasMaximized, bounds };
    videoOsFullscreenActive = true;
    wantsOsFullscreen = true;
    return true;
  }

  if (shellWindowMode === 'mini') {
    await releaseMiniShellConstraints(win);
  }
  await win.setFocus().catch(() => undefined);

  let entered = false;
  try {
    await win.setFullscreen(true);
    entered = await waitForOsFullscreen(win);
  } catch (error) {
    console.warn('[Virelia] setFullscreen failed, retrying after unmaximize', error);
  }

  if (!entered && wasMaximized) {
    try {
      await win.unmaximize();
      await win.setFullscreen(true);
      entered = await waitForOsFullscreen(win);
    } catch (error) {
      console.warn('[Virelia] setFullscreen retry after unmaximize failed', error);
      await win.maximize().catch(() => undefined);
    }
  }

  if (!entered) {
    console.warn('[Virelia] OS fullscreen not confirmed by isFullscreen(); in-app fullscreen will still apply');
    return false;
  }

  trackedFullscreen = true;
  videoOsRestore = { wasFullscreen, wasMaximized, bounds };
  videoOsFullscreenActive = true;
  wantsOsFullscreen = true;
  return true;
}

export async function tauriExitVideoOsFullscreen(): Promise<void> {
  if (!videoOsFullscreenActive) return;
  const restore = videoOsRestore;
  videoOsFullscreenActive = false;
  videoOsRestore = null;
  videoOsFullscreenExitInFlight = true;

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();

  try {
    if (!restore?.wasFullscreen) {
      await win.setFullscreen(false);
      trackedFullscreen = false;
      wantsOsFullscreen = false;

      if (restore?.wasMaximized) {
        await win.maximize();
      } else if (restore?.bounds) {
        await applyNormalShellConstraints(win);
        await applyBounds(win, restore.bounds);
      }
    }
  } finally {
    videoOsFullscreenExitInFlight = false;
  }
}
