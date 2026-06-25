import type { EnterMiniWindowOptions, ExitMiniTarget, ShellWindowMode } from '../../shared/shellWindowTypes';
import { miniKindFromOptions } from '../../shared/shellWindowTypes';
import { getExpectedMiniDimensions } from '../../shared/miniWindowGeometry';
import {
  enterMiniMode,
  exitMiniMode,
  exitMiniToLibrary,
  playerModeStore
} from '../features/ui/playerModeStore';
import { shouldAnimateMiniWindow } from '../features/mini/miniShellTransition';
import { miniShellTransitionStore } from '../features/mini/miniShellTransitionStore';
import { getPrism } from './prismApi';
import { isTauriShell } from './prismAdapter';
import { enforceAppShellWindowConstraints } from './enforceAppShellWindowConstraints';
import { getTauriShellWindowMode, isMiniShellSuppressedForRenderer } from './tauriMiniWindow';

export type { ExitMiniTarget, ShellWindowMode };

let miniVerifyTimer: ReturnType<typeof setTimeout> | undefined;

export async function getWindowModeState(): Promise<ShellWindowMode | null> {
  const mode = await getPrism()?.window.getShellWindowMode?.();
  if (mode) return mode;
  return playerModeStore.getState().mode === 'mini' ? 'mini' : 'normal';
}

export async function ensureNormalWindow(reason = 'renderer-ensure'): Promise<void> {
  await getPrism()?.window.ensureNormalWindow?.(reason);
}

export async function enterMiniWindow(options?: EnterMiniWindowOptions): Promise<void> {
  const kind = miniKindFromOptions(options);
  const expected = getExpectedMiniDimensions(kind);
  const animate = shouldAnimateMiniWindow(options?.animate);

  if (!animate) {
    enterMiniMode();
  }

  await getPrism()?.window.enterMiniWindow?.({ ...options, animate });

  if (animate) {
    enterMiniMode();
  }

  if (miniVerifyTimer) clearTimeout(miniVerifyTimer);
  if (!animate) {
    miniVerifyTimer = setTimeout(() => {
      void verifyRendererMiniGeometry(expected.width, expected.height, options?.isVideo ?? false);
    }, 100);
  }
}

export async function exitMiniWindow(
  target: ExitMiniTarget,
  options?: Pick<EnterMiniWindowOptions, 'animate'>
): Promise<void> {
  if (miniVerifyTimer) {
    clearTimeout(miniVerifyTimer);
    miniVerifyTimer = undefined;
  }
  const ipcTarget = target === 'library' ? 'library' : 'restore';
  const reason = target === 'library' ? 'mini-x-to-library' : 'mini-restore';
  const animate = shouldAnimateMiniWindow(options?.animate);

  await getPrism()?.window.exitMiniWindow?.(ipcTarget, { animate });

  if (target === 'library') {
    exitMiniToLibrary();
  } else {
    exitMiniMode();
  }

  const { restoreWasMaximized, restoreWasFullScreen } = miniShellTransitionStore.getState();

  if (!restoreWasMaximized && !restoreWasFullScreen) {
    await ensureNormalWindow(reason);
    await enforceAppShellWindowConstraints();
  }

  miniShellTransitionStore.patch({
    restoreWasMaximized: false,
    restoreWasFullScreen: false,
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('prism:shell-restored'));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('prism:shell-restored'));
    }, 120);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('prism:shell-restored'));
    }, 420);
  }
}

async function verifyRendererMiniGeometry(
  expectedWidth: number,
  expectedHeight: number,
  isVideo: boolean
): Promise<void> {
  const shellMode = await getWindowModeState();
  if (shellMode !== 'mini' || playerModeStore.getState().mode !== 'mini') return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w <= expectedWidth + 64 && h <= expectedHeight + 64) return;

  if (isTauriShell()) {
    if (getTauriShellWindowMode() !== 'mini' || isMiniShellSuppressedForRenderer()) return;
    if (miniShellTransitionStore.getState().suppressMiniChrome) return;
  }

  console.warn(
    `[Virelia] playerMode/shell mini but window is ${w}x${h} (expected ~${expectedWidth}x${expectedHeight}). Re-applying shell enter.`
  );
  await getPrism()?.window.enterMiniWindow?.({ isVideo });
}
