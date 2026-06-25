import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  screen: {
    getDisplayNearestPoint: () => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1040 }
    }),
    getPrimaryDisplay: () => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1040 }
    })
  }
}));

import {
  createMiniShellState,
  enterMiniShell,
  exitMiniShell,
  ensureNormalShell,
  getShellWindowMode
} from './miniWindowShell';

function createWindowMock(bounds = { x: 100, y: 80, width: 1280, height: 800 }) {
  let currentBounds = { ...bounds };
  let maximized = false;
  let fullScreen = false;
  return {
    getBounds: () => ({ ...currentBounds }),
    setBounds: (next: typeof currentBounds) => {
      currentBounds = { ...next };
      maximized = false;
    },
    isMaximized: () => maximized,
    unmaximize: vi.fn(() => {
      maximized = false;
    }),
    maximize: vi.fn(() => {
      maximized = true;
    }),
    isFullScreen: () => fullScreen,
    setFullScreen: vi.fn((value: boolean) => {
      fullScreen = value;
    }),
    isAlwaysOnTop: () => false,
    setAlwaysOnTop: vi.fn(),
    setMaximizable: vi.fn(),
    setResizable: vi.fn(),
    setMinimumSize: vi.fn(),
    setMaximumSize: vi.fn()
  };
}

describe('miniWindowShell state machine', () => {
  it('enterMini saves normal bounds only once', async () => {
    const state = createMiniShellState();
    const win = createWindowMock();
    await enterMiniShell(win as never, state, 'audio', { animate: false });
    const saved = state.normalBeforeMini.bounds;
    win.setBounds({ x: 0, y: 0, width: 440, height: 188 });
    await enterMiniShell(win as never, state, 'audio', { animate: false });
    expect(state.normalBeforeMini.bounds).toEqual(saved);
    expect(getShellWindowMode(state)).toBe('mini');
  });

  it('exitMini disables always-on-top and restores exact normal bounds', async () => {
    const state = createMiniShellState();
    const win = createWindowMock({ x: 220, y: 140, width: 1100, height: 700 });
    await enterMiniShell(win as never, state, 'audio', { animate: false });
    await exitMiniShell(win as never, state, 'restore', { animate: false });
    expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(getShellWindowMode(state)).toBe('normal');
    expect(win.getBounds()).toMatchObject({ x: 220, y: 140, width: 1100, height: 700 });
  });

  it('restore maximizes when window was maximized before mini', async () => {
    const state = createMiniShellState();
    const win = createWindowMock({ x: 0, y: 0, width: 1920, height: 1040 });
    let maximized = true;
    win.isMaximized = () => maximized;
    win.maximize = vi.fn(() => {
      maximized = true;
    });
    win.unmaximize = vi.fn(() => {
      maximized = false;
    });
    await enterMiniShell(win as never, state, 'audio', { animate: false });
    expect(state.normalBeforeMini.wasMaximized).toBe(true);
    expect(state.normalBeforeMini.bounds).toBeUndefined();
    await exitMiniShell(win as never, state, 'restore', { animate: false });
    expect(win.maximize).toHaveBeenCalled();
  });

  it('does not save mini-like bounds as normal', async () => {
    const state = createMiniShellState();
    const win = createWindowMock({ x: 0, y: 0, width: 440, height: 188 });
    await enterMiniShell(win as never, state, 'audio', { animate: false });
    expect(state.normalBeforeMini.bounds).toBeUndefined();
  });

  it('ensureNormalShell clears always-on-top when stuck', async () => {
    const state = createMiniShellState();
    const win = createWindowMock();
    win.isAlwaysOnTop = () => true;
    await ensureNormalShell(win as never, state);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(false);
  });

  it('repeated mini cycles restore the same custom bounds', async () => {
    const state = createMiniShellState();
    const win = createWindowMock({ x: 220, y: 140, width: 1100, height: 700 });
    for (let i = 0; i < 3; i++) {
      await enterMiniShell(win as never, state, 'audio', { animate: false });
      await exitMiniShell(win as never, state, 'restore', { animate: false });
    }
    expect(win.getBounds()).toMatchObject({ x: 220, y: 140, width: 1100, height: 700 });
  });

  it('ensureNormalShell does not reposition when saved state was cleared', async () => {
    const state = createMiniShellState();
    const win = createWindowMock({ x: 300, y: 200, width: 1100, height: 700 });
    state.normalBeforeMini = { wasMaximized: false, wasFullScreen: false, savedAt: 0 };
    ensureNormalShell(win as never, state);
    expect(win.getBounds()).toMatchObject({ x: 300, y: 200, width: 1100, height: 700 });
  });
});
