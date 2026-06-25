import { createStore } from '../../lib/createStore';
import { APP_SHELL_MIN_HEIGHT, APP_SHELL_MIN_WIDTH, CONTENT_MODE_RAIL_MIN_WIDTH } from '../../../shared/appShellConstraints';
import { readStored, STORAGE_KEYS, writeStored } from '../../lib/storageKeys';
import { playUiSound } from '../../services/uiAudioService';
import type { ContentMode } from './contentModeTypes';

export { APP_SHELL_MIN_HEIGHT, APP_SHELL_MIN_WIDTH, CONTENT_MODE_RAIL_MIN_WIDTH };
interface ContentModeState {
  mode: ContentMode;
}

function readInitialContentMode(): ContentMode {
  const stored = readStored<ContentMode>(STORAGE_KEYS.contentMode, 'video');
  return stored === 'music' ? 'music' : 'video';
}

export const contentModeStore = createStore<ContentModeState>({
  mode: readInitialContentMode(),
});

export function getContentMode(): ContentMode {
  return contentModeStore.getState().mode;
}

export function setContentMode(mode: ContentMode): void {
  if (contentModeStore.getState().mode === mode) return;
  contentModeStore.patch({ mode });
  writeStored(STORAGE_KEYS.contentMode, mode);
  playUiSound('mode_switch');
}

export function toggleContentMode(): void {
  setContentMode(contentModeStore.getState().mode === 'video' ? 'music' : 'video');
}

/** Select a mode, or toggle when the active segment is clicked again. */
export function pressContentMode(mode: ContentMode): void {
  if (contentModeStore.getState().mode === mode) {
    toggleContentMode();
    return;
  }
  setContentMode(mode);
}
