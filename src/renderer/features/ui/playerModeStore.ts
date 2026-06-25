import { createStore } from '../../lib/createStore';
import { saveMiniPlayerMode } from '../../lib/playbackPersistence';
import { playUiSound } from '../../services/uiAudioService';
import type { NormalPlayerMode, PlayerMode, PlayerModeState } from './playerModeTypes';

export const playerModeStore = createStore<PlayerModeState>({
  mode: 'library',
  returnMode: 'library',
  videoTheater: false
});

export function getPlayerMode(): PlayerMode {
  return playerModeStore.getState().mode;
}

export function setPlayerMode(mode: PlayerMode): void {
  if (playerModeStore.getState().mode === mode) return;
  playerModeStore.patch({ mode });
  playUiSound('mode_switch');
}

export function enterLibraryMode(): void {
  if (playerModeStore.getState().mode === 'library' && !playerModeStore.getState().videoTheater) return;
  playerModeStore.patch({ mode: 'library', videoTheater: false });
  playUiSound('mode_switch');
}

export function enterPlayerMode(): void {
  if (playerModeStore.getState().mode === 'player') return;
  playerModeStore.patch({ mode: 'player' });
  playUiSound('mode_switch');
}

export function enterMiniMode(): void {
  const { mode, returnMode } = playerModeStore.getState();
  if (mode === 'mini') return;
  const nextReturn: NormalPlayerMode = mode;
  playerModeStore.patch({
    mode: 'mini',
    returnMode: nextReturn,
    videoTheater: false
  });
  saveMiniPlayerMode(true);
  playUiSound('mode_switch');
}

export function exitMiniMode(): void {
  const { mode, returnMode } = playerModeStore.getState();
  if (mode !== 'mini') return;
  playerModeStore.patch({ mode: returnMode, videoTheater: false });
  saveMiniPlayerMode(false);
  playUiSound('mode_switch');
}

/** Leave mini and open Library (does not restore previous player mode). */
export function exitMiniToLibrary(): void {
  if (playerModeStore.getState().mode === 'library') return;
  playerModeStore.patch({ mode: 'library', returnMode: 'library', videoTheater: false });
  saveMiniPlayerMode(false);
  playUiSound('mode_switch');
}

export function syncMiniModeFromShell(active: boolean): void {
  if (active) enterMiniMode();
  else if (playerModeStore.getState().mode === 'mini') exitMiniMode();
}

export function toggleVideoTheater(): void {
  const { videoTheater } = playerModeStore.getState();
  playerModeStore.patch({ videoTheater: !videoTheater });
  playUiSound('mode_switch');
}

export function setVideoTheater(open: boolean): void {
  playerModeStore.patch({ videoTheater: open });
}
