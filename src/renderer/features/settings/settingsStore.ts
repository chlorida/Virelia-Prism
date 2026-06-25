import type { AppSettings } from '../../../shared/types';
import { defaultSettings } from '../../../shared/defaults';
import { defaultUiSoundsSettings } from '../../../shared/uiAudioTypes';
import { createStore } from '../../lib/createStore';
import { getPrism } from '../../lib/prismApi';
import { configureUiAudio } from '../../services/uiAudioService';

interface SettingsState {
  settings?: AppSettings;
  loaded: boolean;
}

export const settingsStore = createStore<SettingsState>({
  settings: undefined,
  loaded: false
});

export function getSettingsSnapshot(): AppSettings {
  return settingsStore.getState().settings ?? defaultSettings;
}

export function setSettingsState(settings: AppSettings): void {
  settingsStore.patch({ settings, loaded: true });
}

export async function loadSettingsFromShell(): Promise<AppSettings> {
  const prism = getPrism();
  if (!prism) throw new Error('Desktop API unavailable');
  const settings = await prism.settings.load();
  setSettingsState({
    ...settings,
    metadata: {
      ...defaultSettings.metadata,
      ...settings.metadata,
    },
    subtitles: {
      ...defaultSettings.subtitles,
      ...settings.subtitles,
    },
    uiSounds: {
      ...defaultUiSoundsSettings(),
      ...settings.uiSounds,
      categories: {
        ...defaultUiSoundsSettings().categories,
        ...settings.uiSounds?.categories,
      },
    },
    discovery: {
      ...defaultSettings.discovery,
      ...settings.discovery,
    },
    onboarding: {
      ...defaultSettings.onboarding,
      ...settings.onboarding,
    },
  });
  return getSettingsSnapshot();
}

export async function saveSettingsPatch(patch: Partial<AppSettings>): Promise<AppSettings> {
  const prism = getPrism();
  if (!prism) throw new Error('Desktop API unavailable');

  const current = getSettingsSnapshot();
  const baseUiSounds = current.uiSounds ?? defaultUiSoundsSettings();
  if (settingsStore.getState().settings) {
    setSettingsState({
      ...current,
      ...patch,
      playback: { ...current.playback, ...patch.playback },
      subtitles: { ...current.subtitles, ...patch.subtitles },
      visualizer: { ...current.visualizer, ...patch.visualizer },
      shortcuts: { ...current.shortcuts, ...patch.shortcuts },
      monetization: { ...current.monetization, ...patch.monetization },
      metadata: { ...current.metadata, ...patch.metadata },
      discovery: { ...current.discovery, ...patch.discovery },
      onboarding: { ...current.onboarding, ...patch.onboarding },
      uiSounds: {
        ...baseUiSounds,
        ...patch.uiSounds,
        categories: {
          ...baseUiSounds.categories,
          ...patch.uiSounds?.categories,
        },
      },
    });
  }

  if (patch.uiSounds) {
    configureUiAudio({
      ...baseUiSounds,
      ...patch.uiSounds,
      categories: {
        ...baseUiSounds.categories,
        ...patch.uiSounds?.categories,
      },
    });
  }

  const next = await prism.settings.save(patch);
  setSettingsState({
    ...next,
    metadata: {
      ...defaultSettings.metadata,
      ...next.metadata,
    },
    subtitles: {
      ...defaultSettings.subtitles,
      ...next.subtitles,
    },
    uiSounds: {
      ...defaultUiSoundsSettings(),
      ...next.uiSounds,
      categories: {
        ...defaultUiSoundsSettings().categories,
        ...next.uiSounds?.categories,
      },
    },
    discovery: {
      ...defaultSettings.discovery,
      ...next.discovery,
    },
    onboarding: {
      ...defaultSettings.onboarding,
      ...next.onboarding,
    },
  });
  return getSettingsSnapshot();
}
