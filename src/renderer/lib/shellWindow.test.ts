import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playerModeStore } from '../features/ui/playerModeStore';

const windowApi = {
  enterMiniWindow: vi.fn(async () => undefined),
  exitMiniWindow: vi.fn(async () => undefined),
  ensureNormalWindow: vi.fn(async () => undefined),
  getShellWindowMode: vi.fn(async () => 'normal' as const)
};

vi.mock('./prismApi', () => ({
  getPrism: () => ({ window: windowApi }),
  isTauriShell: () => false
}));

describe('shellWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerModeStore.patch({ mode: 'library', returnMode: 'library', videoTheater: false });
  });

  it('enterMiniWindow calls shell enter', async () => {
    const { enterMiniWindow } = await import('./shellWindow');
    await enterMiniWindow({ isVideo: false });
    expect(windowApi.enterMiniWindow).toHaveBeenCalledWith({ isVideo: false, animate: true });
  });

  it('exitMiniWindow restore calls shell exit and ensure normal state', async () => {
    const { enterMiniMode, enterPlayerMode } = await import('../features/ui/playerModeStore');
    enterPlayerMode();
    enterMiniMode();
    const { exitMiniWindow } = await import('./shellWindow');
    await exitMiniWindow('restore');
    expect(windowApi.exitMiniWindow).toHaveBeenCalledWith('restore', { animate: true });
    expect(windowApi.ensureNormalWindow).toHaveBeenCalledWith('mini-restore');
    expect(playerModeStore.getState().mode).toBe('player');
  });

  it('exitMiniWindow library sets library mode', async () => {
    const { enterMiniMode } = await import('../features/ui/playerModeStore');
    enterMiniMode();
    const { exitMiniWindow } = await import('./shellWindow');
    await exitMiniWindow('library');
    expect(playerModeStore.getState().mode).toBe('library');
  });
});
