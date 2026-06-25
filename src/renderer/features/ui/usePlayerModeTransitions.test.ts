// @vitest-environment jsdom
import { createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playerModeStore } from './playerModeStore';
import type { usePlayerModeTransitions as UsePlayerModeTransitions } from './usePlayerModeTransitions';

const enterMiniWindow = vi.fn(async (_options?: { isVideo?: boolean }) => undefined);
const exitMiniWindow = vi.fn(async (_target: 'library' | 'restore') => undefined);
vi.mock('../../lib/shellWindow', () => ({
  enterMiniWindow,
  exitMiniWindow
}));

const playbackState = { isVideo: false, isPreviewCollapsed: true };
const setPreviewCollapsed = vi.fn();
const attachPreviewHost = vi.fn();

vi.mock('../../playback/usePlayback', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../playback/usePlayback')>();
  return {
    ...actual,
    usePlayback: () => ({
      actions: {
        setPreviewCollapsed,
        attachPreviewHost,
      },
      controllerReady: true,
    }),
    usePlaybackSelector: (selector: (s: typeof playbackState) => unknown) => selector(playbackState),
  };
});

async function mountTransitions(): Promise<ReturnType<typeof UsePlayerModeTransitions>> {
  const { usePlayerModeTransitions } = await import('./usePlayerModeTransitions');
  let api!: ReturnType<typeof UsePlayerModeTransitions>;
  function Harness() {
    const transitions = usePlayerModeTransitions();
    useEffect(() => {
      api = transitions;
    }, [transitions]);
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(createElement(Harness));
  await new Promise((resolve) => setTimeout(resolve, 0));
  root.unmount();
  return api;
}

describe('usePlayerModeTransitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playbackState.isVideo = false;
    playbackState.isPreviewCollapsed = true;
    playerModeStore.patch({ mode: 'library', returnMode: 'library', videoTheater: false });
  });

  it('enterPlayer is a no-op for audio', async () => {
    const api = await mountTransitions();
    api.enterPlayer();
    expect(playerModeStore.getState().mode).toBe('library');
    expect(enterMiniWindow).not.toHaveBeenCalled();
    expect(exitMiniWindow).not.toHaveBeenCalled();
  });

  it('enterPlayer switches to player for video without shell window APIs', async () => {
    playbackState.isVideo = true;
    const api = await mountTransitions();
    api.enterPlayer();
    expect(playerModeStore.getState().mode).toBe('player');
    expect(enterMiniWindow).not.toHaveBeenCalled();
    expect(exitMiniWindow).not.toHaveBeenCalled();
  });

  it('enterLibrary does not call shell window APIs', async () => {
    playbackState.isVideo = true;
    playerModeStore.patch({ mode: 'player' });
    const api = await mountTransitions();
    api.enterLibrary();
    expect(playerModeStore.getState().mode).toBe('library');
    expect(enterMiniWindow).not.toHaveBeenCalled();
    expect(exitMiniWindow).not.toHaveBeenCalled();
  });

  it('enterMini calls enterMiniWindow immediately while animating', async () => {
    const api = await mountTransitions();
    api.enterMini();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(enterMiniWindow).toHaveBeenCalledWith({ isVideo: false, animate: true });
    expect(exitMiniWindow).not.toHaveBeenCalled();
  });
});
