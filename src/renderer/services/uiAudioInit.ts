import { defaultSettings } from '../../shared/defaults';
import { getSettingsSnapshot, settingsStore } from '../features/settings/settingsStore';
import type { PlaybackStore } from '../playback/playbackStore';
import { configureUiAudio, preloadUiSounds, uiAudioService } from './uiAudioService';

let initialized = false;
let playbackStoreRef: PlaybackStore | null = null;

export function registerPlaybackStoreForUiAudio(store: PlaybackStore): () => void {
  playbackStoreRef = store;
  const sync = () => {
    const state = store.getState();
    uiAudioService.setMediaPlaying(state.playbackStatus === 'playing' && state.isVideo);
  };
  sync();
  return store.subscribe(sync);
}

export function initUiAudioSystem(): () => void {
  if (initialized || typeof window === 'undefined') return () => undefined;
  initialized = true;

  const motionQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : undefined;
  const applyReducedMotion = () => {
    uiAudioService.setReducedMotion(motionQuery?.matches ?? false);
  };
  applyReducedMotion();
  const onMotionChange = () => applyReducedMotion();
  motionQuery?.addEventListener?.('change', onMotionChange);

  const settings = getSettingsSnapshot();
  configureUiAudio(settings.uiSounds ?? defaultSettings.uiSounds);
  preloadUiSounds();

  const unsubSettings = settingsStore.subscribe((state) => {
    if (!state.settings) return;
    configureUiAudio(state.settings.uiSounds ?? defaultSettings.uiSounds);
  });

  return () => {
    unsubSettings();
    playbackStoreRef = null;
    motionQuery?.removeEventListener?.('change', onMotionChange);
    initialized = false;
  };
}
