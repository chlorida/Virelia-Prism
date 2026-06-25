import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  screen: {
    getDisplayNearestPoint: () => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1040 }
    })
  }
}));

import {
  createMiniShellState,
  enterMiniShell,
  exitMiniShell,
  forceNormalWindowState,
  getShellWindowMode
} from './miniWindowShell';

function createWindowMock(bounds = { x: 100, y: 80, width: 1280, height: 800 }) {
  let currentBounds = { ...bounds };
  let maximized = false;
  let alwaysOnTop = false;
  let resizable = true;

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
    setAlwaysOnTop: vi.fn((value: boolean) => {
      alwaysOnTop = value;
    }),
    setMaximizable: vi.fn(),
    setResizable: vi.fn((value: boolean) => {
      resizable = value;
    }),
    isResizable: () => resizable,
    setMinimumSize: vi.fn(),
    setMaximumSize: vi.fn(),
    on: vi.fn()
  };
}

describe('forceNormalWindowState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never restores mini position after mini exit', async () => {
    const state = createMiniShellState();
    const win = createWindowMock({ x: 220, y: 140, width: 1100, height: 700 });
    await enterMiniShell(win as never, state, 'audio', { animate: false });
    expect(win.getBounds().width).toBeLessThanOrEqual(520);

    await exitMiniShell(win as never, state, 'mini-restore', { animate: false });
    expect(getShellWindowMode(state)).toBe('normal');
    expect(win.getBounds()).toMatchObject({ x: 220, y: 140, width: 1100, height: 700 });
    expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(win.setResizable).toHaveBeenLastCalledWith(true);
  });

  it('recovers offscreen mini-sized window using lastGoodNormalBounds', () => {
    const state = createMiniShellState();
    state.lastGoodNormalBounds = { x: 200, y: 120, width: 1280, height: 800 };
    const win = createWindowMock({ x: 1500, y: 900, width: 440, height: 188 });

    forceNormalWindowState(win as never, state, 'broken-state');
    expect(win.getBounds()).toMatchObject({ x: 320, y: 120, width: 1280, height: 800 });
  });

  it('uses centered fallback when saved and lastGood invalid', () => {
    const state = createMiniShellState();
    const win = createWindowMock({ x: 1700, y: 920, width: 440, height: 188 });

    forceNormalWindowState(win as never, state, 'fallback-only');
    const b = win.getBounds();
    expect(b.width).toBeGreaterThanOrEqual(880);
    expect(b.height).toBeGreaterThanOrEqual(640);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(1920 + 8);
  });

  it('maximizes when wasMaximized before mini', () => {
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

    const snap = { wasMaximized: true, wasFullScreen: false, savedAt: Date.now() };
    forceNormalWindowState(win as never, state, 'mini-restore', snap);
    expect(win.maximize).toHaveBeenCalled();
    expect(win.isMaximized()).toBe(true);
  });
});
