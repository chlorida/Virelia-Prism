import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

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
  clearAllTimers,
  createMiniShellState,
  enterMiniShell,
  exitMiniShell,
  ensureNormalShell,
  getShellWindowMode,
  type MiniShellState
} from './miniWindowShell';

function createWindowMock(bounds = { x: 100, y: 80, width: 1280, height: 800 }) {
  let currentBounds = { ...bounds };
  let maximized = false;
  let alwaysOnTop = false;
  let resizable = true;
  let minSize = { width: 720, height: 520 };
  let maxSize = { width: 10000, height: 10000 };

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
    isFullScreen: () => false,
    setFullScreen: vi.fn(),
    isAlwaysOnTop: () => alwaysOnTop,
    setAlwaysOnTop: vi.fn((_value: boolean) => {
      alwaysOnTop = _value;
    }),
    setMaximizable: vi.fn(),
    setResizable: vi.fn((value: boolean) => {
      resizable = value;
    }),
    isResizable: () => resizable,
    setMinimumSize: vi.fn((w: number, h: number) => {
      minSize = { width: w, height: h };
    }),
    setMaximumSize: vi.fn((w: number, h: number) => {
      maxSize = { width: w, height: h };
    }),
    on: vi.fn()
  };
}

describe('miniWindowShell lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exitMini sets shell normal before restoring and clears pending timers', async () => {
    const state = createMiniShellState();
    const win = createWindowMock({ x: 220, y: 140, width: 1100, height: 700 });
    await enterMiniShell(win as never, state, 'audio', { animate: false });
    expect(getShellWindowMode(state)).toBe('mini');

    await exitMiniShell(win as never, state, 'restore', { animate: false });
    expect(getShellWindowMode(state)).toBe('normal');
    expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(win.setResizable).toHaveBeenLastCalledWith(true);
    expect(win.getBounds()).toMatchObject({ x: 220, y: 140, width: 1100, height: 700 });

    win.setBounds({ x: 1500, y: 900, width: 440, height: 188 });
    vi.advanceTimersByTime(200);
    expect(getShellWindowMode(state)).toBe('normal');
  });

  it('ensureNormalShell fixes mini-sized offscreen window in normal mode', async () => {
    const state = createMiniShellState();
    const win = createWindowMock({ x: 1500, y: 900, width: 440, height: 188 });
    state.lastGoodNormalBounds = { x: 200, y: 120, width: 1280, height: 800 };

    await ensureNormalShell(win as never, state, 'test-restore');

    expect(getShellWindowMode(state)).toBe('normal');
    expect(win.getBounds()).toMatchObject({ x: 320, y: 120, width: 1280, height: 800 });
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(false);
  });

  it('clearAllTimers prevents late mini reapply after exit', async () => {
    const state = createMiniShellState();
    const win = createWindowMock();
    await enterMiniShell(win as never, state, 'audio', { animate: false });
    const timerCount = state.pendingTimers.length;
    expect(timerCount).toBeGreaterThan(0);

    await exitMiniShell(win as never, state, undefined, { animate: false });
    expect(state.pendingTimers.length).toBeGreaterThanOrEqual(1);

    vi.advanceTimersByTime(500);
    expect(win.getBounds().width).toBeGreaterThan(500);
    expect(getShellWindowMode(state)).toBe('normal');
  });
});
