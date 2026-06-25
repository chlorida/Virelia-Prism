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
  handleNativeWindowShow
} from './miniWindowShell';

function createWindowMock(bounds = { x: 100, y: 80, width: 1280, height: 800 }) {
  let currentBounds = { ...bounds };
  let maximized = false;
  const setBounds = vi.fn((next: typeof currentBounds) => {
    currentBounds = { ...next };
    maximized = false;
  });
  const maximize = vi.fn(() => {
    maximized = true;
    currentBounds = { x: 0, y: 0, width: 1920, height: 1040 };
  });

  return {
    getBounds: () => ({ ...currentBounds }),
    getNormalBounds: () => ({ x: 220, y: 140, width: 1100, height: 700 }),
    setBounds,
    isMaximized: () => maximized,
    unmaximize: vi.fn(() => {
      maximized = false;
      currentBounds = { x: 220, y: 140, width: 1100, height: 700 };
    }),
    maximize,
    isFullScreen: () => false,
    setFullScreen: vi.fn(),
    isMinimized: () => false,
    restore: vi.fn(),
    isAlwaysOnTop: () => false,
    setAlwaysOnTop: vi.fn(),
    setMaximizable: vi.fn(),
    setResizable: vi.fn(),
    setMinimumSize: vi.fn(),
    setMaximumSize: vi.fn(),
    on: vi.fn()
  };
}

describe('maximized restore after mini', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('entering mini from maximized stores wasMaximized=true and no saved bounds', async () => {
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
    expect(state.normalBeforeMini.savedAt).toBeGreaterThan(0);
  });

  it('restore from maximized calls maximize without setBounds after maximize', async () => {
    const state = createMiniShellState();
    const win = createWindowMock({ x: 0, y: 0, width: 1920, height: 1040 });
    let maximized = true;
    win.isMaximized = () => maximized;
    win.unmaximize = vi.fn(() => {
      maximized = false;
    });
    win.maximize = vi.fn(() => {
      maximized = true;
    });

    await enterMiniShell(win as never, state, 'audio', { animate: false });
    win.setBounds.mockClear();
    win.maximize.mockClear();

    await exitMiniShell(win as never, state, 'mini-restore', { animate: false });
    vi.advanceTimersByTime(120);

    expect(win.maximize).toHaveBeenCalled();
    const callsAfterMaximize = win.setBounds.mock.calls.length;
    expect(win.isMaximized()).toBe(true);
    expect(callsAfterMaximize).toBe(0);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(win.setResizable).toHaveBeenCalledWith(true);
  });

  it('native show does not clamp bounds while maximized', () => {
    const state = createMiniShellState();
    const win = createWindowMock({ x: 0, y: 0, width: 1920, height: 1040 });
    let maximized = true;
    win.isMaximized = () => maximized;
    win.setBounds.mockClear();

    handleNativeWindowShow(win as never, state, 'restore');
    expect(win.setBounds).not.toHaveBeenCalled();
  });

  it('repeated maximized mini cycles stay maximized', async () => {
    const state = createMiniShellState();
    const win = createWindowMock();
    let maximized = false;
    win.isMaximized = () => maximized;
    win.maximize = vi.fn(() => {
      maximized = true;
    });

    for (let i = 0; i < 2; i++) {
      maximized = true;
      await enterMiniShell(win as never, state, 'audio', { animate: false });
      await exitMiniShell(win as never, state, undefined, { animate: false });
      vi.advanceTimersByTime(120);
      expect(win.isMaximized()).toBe(true);
    }
  });

  it('forceNormal with wasMaximized does not apply pickTarget bounds', () => {
    const state = createMiniShellState();
    state.lastGoodNormalBounds = { x: 100, y: 80, width: 1280, height: 800 };
    const win = createWindowMock({ x: 1500, y: 900, width: 440, height: 188 });
    const snap = { wasMaximized: true, wasFullScreen: false, savedAt: Date.now(), bounds: undefined };

    forceNormalWindowState(win as never, state, 'test', snap);
    vi.advanceTimersByTime(120);

    expect(win.maximize).toHaveBeenCalled();
    expect(win.isMaximized()).toBe(true);
  });
});
