// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  enterLibraryMode,
  enterMiniMode,
  enterPlayerMode,
  exitMiniMode,
  playerModeStore
} from './playerModeStore';

describe('playerModeStore', () => {
  beforeEach(() => {
    playerModeStore.setState({ mode: 'library', returnMode: 'library', videoTheater: false });
    localStorage.clear();
  });

  it('enters player mode without changing return mode baseline', () => {
    enterPlayerMode();
    expect(playerModeStore.getState().mode).toBe('player');
  });

  it('mini mode remembers return mode and restores on exit', () => {
    enterPlayerMode();
    enterMiniMode();
    expect(playerModeStore.getState().mode).toBe('mini');
    expect(playerModeStore.getState().returnMode).toBe('player');
    exitMiniMode();
    expect(playerModeStore.getState().mode).toBe('player');
  });

  it('library mode clears theater flag', () => {
    playerModeStore.patch({ videoTheater: true });
    enterLibraryMode();
    expect(playerModeStore.getState().videoTheater).toBe(false);
  });
});
