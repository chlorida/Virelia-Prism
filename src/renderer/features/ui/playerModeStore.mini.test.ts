// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  enterMiniMode,
  enterPlayerMode,
  exitMiniMode,
  exitMiniToLibrary,
  playerModeStore
} from './playerModeStore';

describe('playerModeStore mini exit', () => {
  beforeEach(() => {
    playerModeStore.setState({ mode: 'library', returnMode: 'library', videoTheater: false });
    localStorage.clear();
  });

  it('restore mini returns previous mode via exitMiniMode', () => {
    enterPlayerMode();
    enterMiniMode();
    expect(playerModeStore.getState().returnMode).toBe('player');
    exitMiniMode();
    expect(playerModeStore.getState().mode).toBe('player');
  });

  it('close mini to library forces library mode', () => {
    enterPlayerMode();
    enterMiniMode();
    exitMiniToLibrary();
    expect(playerModeStore.getState().mode).toBe('library');
  });
});
