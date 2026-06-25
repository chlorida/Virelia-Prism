// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { enterLibraryMode, enterMiniMode, enterPlayerMode, exitMiniMode, playerModeStore } from '../features/ui/playerModeStore';

describe('player mode transitions (store)', () => {
  beforeEach(() => {
    playerModeStore.setState({ mode: 'library', returnMode: 'library', videoTheater: false });
    localStorage.clear();
  });

  it('library → player → library preserves returnMode baseline', () => {
    enterPlayerMode();
    expect(playerModeStore.getState().mode).toBe('player');
    enterLibraryMode();
    expect(playerModeStore.getState().mode).toBe('library');
  });

  it('player → mini → restore returns to player', () => {
    enterPlayerMode();
    enterMiniMode();
    expect(playerModeStore.getState().returnMode).toBe('player');
    exitMiniMode();
    expect(playerModeStore.getState().mode).toBe('player');
  });

  it('library → mini → restore returns to library', () => {
    enterMiniMode();
    expect(playerModeStore.getState().returnMode).toBe('library');
    exitMiniMode();
    expect(playerModeStore.getState().mode).toBe('library');
  });
});
