// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resizeHandlers: Array<() => void> = [];

const winMock = {
  isMaximized: vi.fn(async () => false),
  isFullscreen: vi.fn(async () => false),
  isMinimized: vi.fn(async () => false),
  setFullscreen: vi.fn(async (_value?: boolean) => undefined),
  setFocus: vi.fn(async () => undefined),
  show: vi.fn(async () => undefined),
  unminimize: vi.fn(async () => undefined),
  unmaximize: vi.fn(async () => undefined),
  outerPosition: vi.fn(async () => ({ x: 100, y: 80 })),
  outerSize: vi.fn(async () => ({ width: 1280, height: 800 })),
  setPosition: vi.fn(async () => undefined),
  setSize: vi.fn(async () => undefined),
  setAlwaysOnTop: vi.fn(async () => undefined),
  setResizable: vi.fn(async () => undefined),
  setMinSize: vi.fn(async () => undefined),
  setMaxSize: vi.fn(async () => undefined),
  maximize: vi.fn(async () => undefined),
  hide: vi.fn(async () => undefined),
  setSizeConstraints: vi.fn(async () => undefined),
  isFocused: vi.fn(async () => true),
  onResized: vi.fn(async (handler: () => void) => {
    resizeHandlers.push(handler);
    return () => undefined;
  }),
};

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => winMock,
  LogicalPosition: class {
    constructor(public x: number, public y: number) {}
  },
  LogicalSize: class {
    constructor(public width: number, public height: number) {}
  },
  currentMonitor: vi.fn(async () => ({
    scaleFactor: 1,
    workArea: {
      position: { x: 0, y: 0 },
      size: { width: 1920, height: 1040 }
    }
  }))
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: () => void) => {
    if (event === 'tauri://resize') resizeHandlers.push(handler);
    return () => undefined;
  }),
}));

describe('tauriMiniWindow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
    resizeHandlers.length = 0;
    winMock.isMaximized.mockResolvedValue(false);
    winMock.isFullscreen.mockResolvedValue(false);
    winMock.isFocused.mockResolvedValue(true);
    winMock.outerSize.mockResolvedValue({ width: 1280, height: 800 });
    winMock.outerPosition.mockResolvedValue({ x: 100, y: 80 });
  });

  it('enters mini with compact size near work area', async () => {
    const { tauriEnterMiniWindow, getTauriShellWindowMode } = await import('./tauriMiniWindow');
    await tauriEnterMiniWindow(false, { animate: false });
    expect(getTauriShellWindowMode()).toBe('mini');
    expect(winMock.setSize).toHaveBeenCalled();
    expect(winMock.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(winMock.setResizable).toHaveBeenCalledWith(false);
  });

  it('restores saved bounds on exit and disables always-on-top', async () => {
    const { tauriEnterMiniWindow, tauriExitMiniWindow, getTauriShellWindowMode } = await import('./tauriMiniWindow');
    await tauriEnterMiniWindow(false, { animate: false });
    await tauriExitMiniWindow(undefined, { animate: false });
    expect(getTauriShellWindowMode()).toBe('normal');
    expect(winMock.setSize.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(winMock.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    const positions = winMock.setPosition.mock.calls.map(
      (call) => (call as unknown as [{ x: number; y: number }])[0]
    );
    expect(positions.some((pos) => pos.x === 100 && pos.y === 80)).toBe(true);
  });

  it('repeated mini cycles restore the same logical position', async () => {
    const { tauriEnterMiniWindow, tauriExitMiniWindow } = await import('./tauriMiniWindow');
    for (let i = 0; i < 3; i++) {
      await tauriEnterMiniWindow(false, { animate: false });
      await tauriExitMiniWindow(undefined, { animate: false });
    }
    const restorePositions = winMock.setPosition.mock.calls
      .map((call) => (call as unknown as [{ x: number; y: number }])[0])
      .filter((pos) => pos.x === 100 && pos.y === 80);
    expect(restorePositions.length).toBeGreaterThanOrEqual(3);
  });

  it('restore maximizes when window was maximized before mini', async () => {
    let maximized = true;
    winMock.isMaximized.mockImplementation(async () => maximized);
    winMock.unmaximize.mockImplementation(async () => {
      maximized = false;
    });
    const { tauriEnterMiniWindow, tauriExitMiniWindow } = await import('./tauriMiniWindow');
    await tauriEnterMiniWindow(false, { animate: false });
    await tauriExitMiniWindow(undefined, { animate: false });
    expect(winMock.unmaximize).toHaveBeenCalled();
    expect(winMock.maximize).toHaveBeenCalled();
  });

  it('restore fullscreen when window was fullscreen before mini', async () => {
    let fullscreen = true;
    winMock.isFullscreen.mockImplementation(async () => fullscreen);
    winMock.setFullscreen.mockImplementation(async (value?: boolean) => {
      fullscreen = value ?? false;
    });
    const { tauriEnterMiniWindow, tauriExitMiniWindow } = await import('./tauriMiniWindow');
    await tauriEnterMiniWindow(false, { animate: false });
    await tauriExitMiniWindow(undefined, { animate: false });
    expect(winMock.setFullscreen).toHaveBeenCalledWith(false);
    expect(winMock.setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(winMock.setResizable).toHaveBeenCalledWith(true);
    expect(winMock.setSizeConstraints).toHaveBeenCalled();
    expect(winMock.setFullscreen).toHaveBeenCalledWith(true);
  });

  it('restores normal bounds when leaving fullscreen after mini round-trip', async () => {
    vi.useFakeTimers();
    let fullscreen = true;
    winMock.isFullscreen.mockImplementation(async () => fullscreen);
    winMock.setFullscreen.mockImplementation(async (value?: boolean) => {
      fullscreen = value ?? false;
      if (!fullscreen) {
        winMock.outerSize.mockResolvedValue({ width: 1280, height: 800 });
        winMock.outerPosition.mockResolvedValue({ x: 100, y: 80 });
      }
    });
    winMock.outerSize.mockResolvedValue({ width: 1920, height: 1040 });
    winMock.outerPosition.mockResolvedValue({ x: 0, y: 0 });

    const { tauriEnterMiniWindow, tauriExitMiniWindow } = await import('./tauriMiniWindow');
    await tauriEnterMiniWindow(false, { animate: false });
    await tauriExitMiniWindow(undefined, { animate: false });

    fullscreen = false;
    winMock.outerSize.mockResolvedValue({ width: 440, height: 188 });
    winMock.outerPosition.mockResolvedValue({ x: 1470, y: 900 });
    for (const handler of resizeHandlers) handler();
    await vi.advanceTimersByTimeAsync(450);

    expect(winMock.hide).toHaveBeenCalled();
    expect(winMock.show).toHaveBeenCalled();
    const sizes = winMock.setSize.mock.calls.map(
      (call) => (call as unknown as [{ width: number; height: number }])[0]
    );
    expect(sizes.some((size) => size.width >= 880 && size.height >= 640)).toBe(true);
    vi.useRealTimers();
  });

  it('ensureNormalWindow disables always-on-top', async () => {
    const { tauriEnsureNormalWindow } = await import('./tauriMiniWindow');
    await tauriEnsureNormalWindow();
    expect(winMock.setAlwaysOnTop).toHaveBeenCalledWith(false);
  });

  it('does not shrink window when fullscreen drops during Alt+Tab', async () => {
    let fullscreen = true;
    winMock.isFullscreen.mockImplementation(async () => fullscreen);
    winMock.isFocused.mockResolvedValue(false);
    winMock.setFullscreen.mockImplementation(async (value?: boolean) => {
      fullscreen = value ?? false;
    });

    const { tauriInitWindowShellLifecycle } = await import('./tauriMiniWindow');
    await tauriInitWindowShellLifecycle();

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });

    fullscreen = false;
    for (const handler of resizeHandlers) handler();
    await Promise.resolve();

    expect(winMock.hide).not.toHaveBeenCalled();
    const sizes = winMock.setSize.mock.calls.map(
      (call) => (call as unknown as [{ width: number; height: number }])[0]
    );
    expect(sizes.some((size) => size.width <= 500)).toBe(false);

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('does not mark transient fullscreen loss when exiting fullscreen while focused', async () => {
    let fullscreen = true;
    winMock.isFullscreen.mockImplementation(async () => fullscreen);
    winMock.isFocused.mockResolvedValue(true);
    winMock.setFullscreen.mockImplementation(async (value?: boolean) => {
      fullscreen = value ?? false;
    });

    const { tauriInitWindowShellLifecycle, tauriHandleShellFocus } = await import('./tauriMiniWindow');
    await tauriInitWindowShellLifecycle();

    fullscreen = false;
    for (const handler of resizeHandlers) handler();

    winMock.setFullscreen.mockClear();
    await tauriHandleShellFocus();

    expect(winMock.setFullscreen).not.toHaveBeenCalledWith(true);
  });
});
