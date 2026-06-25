// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../../shared/defaults';
import { getSettingsSnapshot, loadSettingsFromShell, saveSettingsPatch, settingsStore } from './settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    settingsStore.setState({ settings: undefined, loaded: false });
    window.prism = {
      settings: {
        load: vi.fn(async () => ({ ...defaultSettings, libraryFolders: ['C:\\music'] })),
        save: vi.fn(async (patch) => ({ ...defaultSettings, ...patch }))
      }
    } as unknown as typeof window.prism;
  });

  it('loads settings from prism adapter', async () => {
    const settings = await loadSettingsFromShell();
    expect(settings.libraryFolders).toEqual(['C:\\music']);
    expect(getSettingsSnapshot().libraryFolders).toEqual(['C:\\music']);
  });

  it('saves patch through prism adapter', async () => {
    await loadSettingsFromShell();
    const next = await saveSettingsPatch({ theme: 'virelia-dark' });
    expect(window.prism?.settings.save).toHaveBeenCalled();
    expect(next.theme).toBe('virelia-dark');
  });

  it('merges onboarding settings patches', async () => {
    await loadSettingsFromShell();
    const next = await saveSettingsPatch({
      onboarding: {
        welcomeCompleted: true,
        recommendedWhisperModel: 'small',
      },
    });
    expect(next.onboarding.welcomeCompleted).toBe(true);
    expect(next.onboarding.recommendedWhisperModel).toBe('small');
  });
});
