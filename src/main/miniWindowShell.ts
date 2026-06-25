import { screen, type BrowserWindow, type Rectangle } from 'electron';
import {
  computeMiniBounds,
  getMiniWindowSize,
  isMiniLikeBounds,
  type MiniMediaKind,
  type WindowBounds
} from '../shared/miniWindowGeometry';
import { APP_SHELL_MIN_HEIGHT, APP_SHELL_MIN_WIDTH } from '../shared/appShellConstraints';
import {
  isBrokenNormalBoundsForCorrection,
  pickTargetNormalBounds,
  clampBoundsToWorkArea,
  validateNormalBounds
} from '../shared/normalBoundsValidation';
import {
  captureBoundsCandidate,
  createSavedNormalWindowState,
  pickRestoreBounds,
  type SavedNormalWindowState
} from '../shared/normalWindowRestore';
import type { ShellWindowMode } from '../shared/shellWindowTypes';
import { logWindowState, logIgnoredBoundsSave } from '../shared/windowStateDebug';
import { animateWindowBounds } from '../shared/windowBoundsAnimation';

export interface MiniShellState {
  mode: ShellWindowMode;
  normalBeforeMini: SavedNormalWindowState;
  lastGoodNormalBounds?: WindowBounds;
  lastMiniKind: MiniMediaKind;
  pendingTimers: ReturnType<typeof setTimeout>[];
  restoringMaximized?: boolean;
}

export function createMiniShellState(): MiniShellState {
  return {
    mode: 'normal',
    normalBeforeMini: createSavedNormalWindowState(),
    lastMiniKind: 'audio',
    pendingTimers: []
  };
}

export function getShellWindowMode(state: MiniShellState): ShellWindowMode {
  return state.mode;
}

function readBounds(window: BrowserWindow): WindowBounds {
  const b = window.getBounds();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}

function getWorkAreaForWindow(window: BrowserWindow): Rectangle {
  return screen.getDisplayNearestPoint(window.getBounds()).workArea;
}

function scheduleTimeout(state: MiniShellState, fn: () => void, ms: number): void {
  const id = setTimeout(() => {
    state.pendingTimers = state.pendingTimers.filter((t) => t !== id);
    fn();
  }, ms);
  state.pendingTimers.push(id);
}

export function clearAllTimers(state: MiniShellState): void {
  for (const id of state.pendingTimers) {
    clearTimeout(id);
  }
  state.pendingTimers = [];
}

function cloneSavedState(snap: SavedNormalWindowState): SavedNormalWindowState {
  return {
    wasMaximized: snap.wasMaximized,
    wasFullScreen: snap.wasFullScreen,
    savedAt: snap.savedAt,
    bounds: snap.bounds ? { ...snap.bounds } : undefined
  };
}

function markRestoringMaximized(state: MiniShellState): void {
  state.restoringMaximized = true;
  scheduleTimeout(state, () => {
    state.restoringMaximized = false;
  }, 200);
}

function isSkippingBoundsCorrection(window: BrowserWindow, state: MiniShellState): boolean {
  return Boolean(state.restoringMaximized || window.isMaximized() || window.isFullScreen());
}

function rememberGoodNormalBounds(
  state: MiniShellState,
  bounds: WindowBounds,
  workArea: Rectangle,
  reason: string
): void {
  if (!validateNormalBounds(bounds, workArea)) {
    logIgnoredBoundsSave('invalid for work area', { reason, bounds });
    return;
  }
  state.lastGoodNormalBounds = { ...bounds };
}

function tryPersistGoodNormalBounds(window: BrowserWindow, state: MiniShellState, reason: string): void {
  if (state.mode === 'mini') {
    logIgnoredBoundsSave('shellWindowMode mini', { reason });
    return;
  }
  if (window.isMinimized?.() || isSkippingBoundsCorrection(window, state)) {
    if (window.isMaximized()) {
      logWindowState('skippedBoundsCorrectionBecauseMaximized', { reason });
    }
    return;
  }

  const workArea = getWorkAreaForWindow(window);
  const bounds = readBounds(window);
  if (isBrokenNormalBoundsForCorrection(bounds, workArea)) {
    logIgnoredBoundsSave('broken normal bounds', { reason, bounds });
    return;
  }
  rememberGoodNormalBounds(state, bounds, workArea, reason);
}

function applyNormalShellConstraints(window: BrowserWindow): void {
  window.setAlwaysOnTop(false);
  window.setMaximizable(true);
  window.setResizable(true);
  window.setMinimumSize(APP_SHELL_MIN_WIDTH, APP_SHELL_MIN_HEIGHT);
  window.setMaximumSize(10000, 10000);
}

function applyMiniGeometry(window: BrowserWindow, state: MiniShellState, kind: MiniMediaKind): WindowBounds {
  if (state.mode !== 'mini') {
    console.warn('[window-state] applyMiniGeometry skipped: shellWindowMode is not mini');
    return readBounds(window);
  }

  const size = getMiniWindowSize(kind);
  const display = screen.getDisplayNearestPoint(window.getBounds());
  const bounds = computeMiniBounds(display.workArea, size);

  window.setAlwaysOnTop(true, 'floating');
  window.setMaximizable(false);
  window.setResizable(false);
  window.setMinimumSize(size.width, size.height);
  window.setMaximumSize(size.width, size.height);
  if (window.isMaximized()) window.unmaximize();
  if (window.isFullScreen()) window.setFullScreen(false);
  window.setBounds(bounds, true);
  state.lastMiniKind = kind;
  return bounds;
}

function readNormalBoundsCandidate(window: BrowserWindow, workArea: Rectangle): WindowBounds | undefined {
  if (typeof window.getNormalBounds === 'function') {
    const nb = window.getNormalBounds();
    return captureBoundsCandidate(
      { x: nb.x, y: nb.y, width: nb.width, height: nb.height },
      false,
      false,
      workArea
    );
  }
  return undefined;
}

function captureNormalWindowState(window: BrowserWindow, state: MiniShellState): void {
  if (state.mode === 'mini') return;

  const snap = state.normalBeforeMini;
  const workArea = getWorkAreaForWindow(window);
  const actualBefore = readBounds(window);
  snap.wasMaximized = window.isMaximized();
  snap.wasFullScreen = window.isFullScreen();
  snap.savedAt = Date.now();

  if (workArea && !snap.wasMaximized && !snap.wasFullScreen) {
    const pre = captureBoundsCandidate(actualBefore, false, false, workArea);
    if (pre) rememberGoodNormalBounds(state, pre, workArea, 'enter-mini-pre');
  }

  if (snap.wasMaximized) {
    const fromNormal = readNormalBoundsCandidate(window, workArea);
    if (fromNormal) rememberGoodNormalBounds(state, fromNormal, workArea, 'enter-mini-normal-bounds');
  }

  if (snap.wasFullScreen) window.setFullScreen(false);
  if (snap.wasMaximized) window.unmaximize();

  const afterMutation = readBounds(window);
  const restoredCandidate = captureBoundsCandidate(afterMutation, false, false, workArea);
  if (restoredCandidate) {
    rememberGoodNormalBounds(state, restoredCandidate, workArea, 'enter-mini-restored');
  }

  let candidate: WindowBounds | undefined;
  if (!snap.wasMaximized && !snap.wasFullScreen) {
    candidate = restoredCandidate
      ?? captureBoundsCandidate(actualBefore, false, false, workArea);
    if (!candidate) {
      const clamped = clampBoundsToWorkArea(actualBefore, workArea);
      if (!isMiniLikeBounds(clamped) && validateNormalBounds(clamped, workArea)) {
        candidate = clamped;
      }
    }
    if (candidate) rememberGoodNormalBounds(state, candidate, workArea, 'enter-mini-capture');
  }

  snap.bounds = snap.wasMaximized || snap.wasFullScreen ? undefined : candidate;

  logWindowState('saveBeforeMini', {
    actualBounds: actualBefore,
    wasMaximized: snap.wasMaximized,
    wasFullscreen: snap.wasFullScreen,
    savedNormalBounds: snap.bounds,
    restoredCandidate,
    shellWindowMode: state.mode
  });
}

function scheduleVerifyNormalBounds(
  window: BrowserWindow,
  state: MiniShellState,
  workArea: Rectangle,
  targetBounds: WindowBounds,
  usedFallback: boolean
): void {
  scheduleTimeout(state, () => {
    if (state.mode !== 'normal' || isSkippingBoundsCorrection(window, state)) {
      if (window.isMaximized()) {
        logWindowState('skippedBoundsCorrectionBecauseMaximized', { phase: 'post-normal-verify' });
      }
      return;
    }
    const actual = readBounds(window);
    if (isBrokenNormalBoundsForCorrection(actual, workArea, { restoringMaximized: state.restoringMaximized })) {
      const recovery = pickTargetNormalBounds(workArea, undefined, state.lastGoodNormalBounds);
      window.setBounds(recovery.bounds as Rectangle, true);
      console.error('[window-state] normal restore failed: still mini-sized or offscreen', {
        actual,
        recovery: recovery.bounds,
        usedFallback
      });
      logWindowState('forceNormal fallback applied', {
        targetBounds: recovery.bounds,
        actualAfter: readBounds(window),
        usedFallback: true
      });
      return;
    }
    applyNormalShellConstraints(window);
    if (!usedFallback && validateNormalBounds(targetBounds, workArea)) {
      rememberGoodNormalBounds(state, readBounds(window), workArea, 'force-normal-verify');
    }
  }, 50);
}

function restoreMaximizedFromMini(
  window: BrowserWindow,
  state: MiniShellState,
  snap: SavedNormalWindowState,
  reason: string
): void {
  const before = readBounds(window);
  markRestoringMaximized(state);
  state.mode = 'normal';
  applyNormalShellConstraints(window);

  if (window.isMinimized?.()) window.restore?.();
  if (window.isFullScreen()) window.setFullScreen(false);

  window.maximize();

  logWindowState('restoreMaximizedFromMini', {
    reason,
    before,
    constraintsCleared: true,
    maximizeCalled: true,
    after: readBounds(window),
    isMaximized: window.isMaximized()
  });

  scheduleTimeout(state, () => {
    if (state.mode !== 'normal') return;
    if (!window.isMaximized()) {
      window.maximize();
      logWindowState('restoreMaximizedFromMini', {
        reason,
        retryMaximize: true,
        after: readBounds(window),
        isMaximized: window.isMaximized()
      });
    }
    applyNormalShellConstraints(window);
  }, 80);
}

function restoreNormalFromMini(
  window: BrowserWindow,
  state: MiniShellState,
  snap: SavedNormalWindowState,
  workArea: Rectangle,
  reason: string
): void {
  const restored = pickRestoreBounds(snap, workArea);
  const pick = restored
    ? { bounds: restored, usedFallback: false, source: 'savedNormal' as const }
    : pickTargetNormalBounds(workArea, snap.bounds, state.lastGoodNormalBounds);

  if (window.isMinimized?.()) window.restore?.();
  if (window.isFullScreen()) window.setFullScreen(false);

  window.setBounds(pick.bounds as Rectangle, true);

  logWindowState('forceNormal applied', {
    reason,
    targetBounds: pick.bounds,
    actualAfter: readBounds(window),
    usedFallback: pick.usedFallback,
    source: pick.source,
    action: 'normal-bounds'
  });

  if (!pick.usedFallback) {
    rememberGoodNormalBounds(state, pick.bounds, workArea, reason);
  }

  scheduleVerifyNormalBounds(window, state, workArea, pick.bounds, pick.usedFallback);
}

/**
 * Emergency restore to valid normal window geometry (never mini position/size).
 */
export function forceNormalWindowState(
  window: BrowserWindow,
  state: MiniShellState,
  reason: string,
  savedForRestore?: SavedNormalWindowState
): void {
  clearAllTimers(state);
  const actualBefore = readBounds(window);
  const workArea = getWorkAreaForWindow(window);
  const snap = savedForRestore ?? state.normalBeforeMini;

  logWindowState('forceNormal start', {
    reason,
    shellWindowMode: state.mode,
    savedNormalBounds: snap.bounds,
    lastGoodNormalBounds: state.lastGoodNormalBounds,
    actualBefore,
    workArea,
    wasMaximized: snap.wasMaximized,
    wasFullscreen: snap.wasFullScreen
  });

  state.mode = 'normal';
  applyNormalShellConstraints(window);

  if (snap.wasFullScreen) {
    if (window.isMinimized?.()) window.restore?.();
    window.setFullScreen(true);
    logWindowState('forceNormal applied', {
      targetBounds: null,
      actualAfter: readBounds(window),
      usedFallback: false,
      action: 'fullscreen'
    });
    return;
  }

  if (snap.wasMaximized) {
    restoreMaximizedFromMini(window, state, snap, reason);
    return;
  }

  restoreNormalFromMini(window, state, snap, workArea, reason);
}

function scheduleMiniGeometryReapply(window: BrowserWindow, state: MiniShellState, kind: MiniMediaKind): void {
  const reapply = () => {
    if (state.mode !== 'mini') return;
    applyMiniGeometry(window, state, kind);
  };
  scheduleTimeout(state, reapply, 0);
  scheduleTimeout(state, reapply, 100);
  scheduleTimeout(state, () => verifyMiniGeometry(window, state, kind), 80);
}

function verifyMiniGeometry(window: BrowserWindow, state: MiniShellState, kind: MiniMediaKind): void {
  if (state.mode !== 'mini') return;
  const bounds = window.getBounds();
  const expected = getMiniWindowSize(kind);
  const sizeOk = Math.abs(bounds.width - expected.width) <= 8
    && Math.abs(bounds.height - expected.height) <= 8;

  if (!sizeOk) {
    console.warn(
      `[Virelia] Mini window geometry mismatch: expected ${expected.width}x${expected.height}, got ${bounds.width}x${bounds.height}. Re-applying.`
    );
    applyMiniGeometry(window, state, kind);
  }
  if (!window.isAlwaysOnTop()) {
    window.setAlwaysOnTop(true, 'floating');
  }
}

export function ensureMiniShellGeometry(window: BrowserWindow, state: MiniShellState): void {
  if (state.mode !== 'mini') {
    console.warn('[window-state] ensureMiniShellGeometry skipped: not in mini shell mode');
    return;
  }
  applyMiniGeometry(window, state, state.lastMiniKind);
}

export function handleNativeWindowShow(window: BrowserWindow, state: MiniShellState, source: string): void {
  logWindowState('nativeRestore', {
    source,
    shellWindowMode: state.mode,
    actualBounds: readBounds(window),
    isMaximized: window.isMaximized()
  });

  if (state.mode === 'mini') {
    ensureMiniShellGeometry(window, state);
    return;
  }

  if (isSkippingBoundsCorrection(window, state)) {
    applyNormalShellConstraints(window);
    logWindowState('skippedBoundsCorrectionBecauseMaximized', { source });
    return;
  }

  const workArea = getWorkAreaForWindow(window);
  const actual = readBounds(window);
  if (isBrokenNormalBoundsForCorrection(actual, workArea, { restoringMaximized: state.restoringMaximized })) {
    forceNormalWindowState(window, state, `native-${source}`);
  } else {
    applyNormalShellConstraints(window);
    rememberGoodNormalBounds(state, actual, workArea, source);
  }
}

export function attachWindowLifecycle(window: BrowserWindow, state: MiniShellState): void {
  const recoverAfterDomHtmlFullscreen = (source: string) => {
    scheduleTimeout(state, () => handleNativeWindowShow(window, state, source), 0);
    scheduleTimeout(state, () => handleNativeWindowShow(window, state, source), 120);
    scheduleTimeout(state, () => handleNativeWindowShow(window, state, source), 400);
  };

  window.webContents.on('leave-html-full-screen', () => {
    recoverAfterDomHtmlFullscreen('leave-html-full-screen');
  });

  window.on('resize', () => tryPersistGoodNormalBounds(window, state, 'resize'));
  window.on('move', () => tryPersistGoodNormalBounds(window, state, 'move'));
  window.on('minimize', () => {
    logWindowState('nativeMinimize', { shellWindowMode: state.mode });
  });
  window.on('restore', () => handleNativeWindowShow(window, state, 'restore'));
  window.on('show', () => handleNativeWindowShow(window, state, 'show'));
  window.on('focus', () => handleNativeWindowShow(window, state, 'focus'));
}

export async function enterMiniShell(
  window: BrowserWindow,
  state: MiniShellState,
  kind: MiniMediaKind,
  options?: { animate?: boolean }
): Promise<void> {
  const shellBefore = state.mode;
  const actualBefore = readBounds(window);
  const animate = options?.animate !== false;

  if (state.mode !== 'mini') {
    captureNormalWindowState(window, state);
    state.mode = 'mini';
  }

  if (window.isFullScreen()) window.setFullScreen(false);
  if (window.isMaximized()) window.unmaximize();

  const size = getMiniWindowSize(kind);
  const workArea = getWorkAreaForWindow(window);
  const from = readBounds(window);
  const to = computeMiniBounds(workArea, size);

  window.setAlwaysOnTop(true, 'floating');
  window.setMaximizable(false);
  window.setResizable(true);
  window.setMinimumSize(200, 160);
  window.setMaximumSize(10000, 10000);

  await animateWindowBounds(from, to, (bounds) => {
    window.setBounds(bounds as Rectangle, false);
  }, { instant: !animate });

  window.setResizable(false);
  window.setMinimumSize(size.width, size.height);
  window.setMaximumSize(size.width, size.height);
  window.setBounds(to as Rectangle, true);
  state.lastMiniKind = kind;

  if (!animate) {
    scheduleMiniGeometryReapply(window, state, kind);
  }

  logWindowState('enterMini', {
    shellWindowModeBefore: shellBefore,
    savedNormalState: cloneSavedState(state.normalBeforeMini),
    targetMiniBounds: to,
    actualAfter: readBounds(window),
    actualBefore,
    animated: animate
  });
}

export async function exitMiniShell(
  window: BrowserWindow,
  state: MiniShellState,
  reason = 'restore',
  options?: { animate?: boolean }
): Promise<void> {
  clearAllTimers(state);
  const snap = cloneSavedState(state.normalBeforeMini);
  const actualBefore = readBounds(window);
  const animate = options?.animate !== false;

  if (snap.wasFullScreen) {
    state.mode = 'normal';
    applyNormalShellConstraints(window);
    window.setFullScreen(true);
    state.normalBeforeMini = createSavedNormalWindowState();
    logWindowState('exitMini', { reason, action: 'fullscreen-restore', actualBefore });
    return;
  }

  if (snap.wasMaximized) {
    state.mode = 'normal';
    applyNormalShellConstraints(window);
    if (window.isFullScreen()) window.setFullScreen(false);
    markRestoringMaximized(state);
    window.maximize();
    state.normalBeforeMini = createSavedNormalWindowState();
    logWindowState('exitMini', { reason, action: 'maximize-restore', actualBefore });
    return;
  }

  const workArea = getWorkAreaForWindow(window);
  const from = readBounds(window);
  const restored = pickRestoreBounds(snap, workArea);
  const to = restored ?? pickTargetNormalBounds(workArea, snap.bounds, state.lastGoodNormalBounds).bounds;

  window.setAlwaysOnTop(false);
  applyNormalShellConstraints(window);

  await animateWindowBounds(from, to, (bounds) => {
    window.setBounds(bounds as Rectangle, false);
  }, { instant: !animate });

  state.mode = 'normal';
  state.normalBeforeMini = createSavedNormalWindowState();
  applyNormalShellConstraints(window);

  logWindowState('exitMini', {
    reason,
    savedNormalState: snap,
    actualBefore,
    actualAfter: readBounds(window),
    alwaysOnTop: window.isAlwaysOnTop(),
    isMaximized: window.isMaximized(),
    animated: animate
  });
}

export async function ensureNormalShell(
  window: BrowserWindow,
  state: MiniShellState,
  reason = 'ensure-normal'
): Promise<void> {
  if (state.mode === 'mini') {
    await exitMiniShell(window, state, reason, { animate: false });
    return;
  }

  if (isSkippingBoundsCorrection(window, state)) {
    state.mode = 'normal';
    applyNormalShellConstraints(window);
    logWindowState('skippedBoundsCorrectionBecauseMaximized', { reason });
    return;
  }

  const workArea = getWorkAreaForWindow(window);
  const actual = readBounds(window);
  if (isBrokenNormalBoundsForCorrection(actual, workArea, { restoringMaximized: state.restoringMaximized })) {
    forceNormalWindowState(window, state, reason);
    return;
  }

  state.mode = 'normal';
  applyNormalShellConstraints(window);
  rememberGoodNormalBounds(state, actual, workArea, reason);
}
