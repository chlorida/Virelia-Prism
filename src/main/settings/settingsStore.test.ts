import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../shared/defaults';
import { SettingsStore } from './settingsStore';

describe('SettingsStore', () => {
  it('returns default settings when no local file exists', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'virelia-settings-'));
    const store = new SettingsStore(root);

    await expect(store.load()).resolves.toEqual(defaultSettings);
  });

  it('persists merged settings locally', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'virelia-settings-'));
    const store = new SettingsStore(root);

    const saved = await store.save({ libraryFolders: ['D:/Media'], playback: { ...defaultSettings.playback, volume: 0.5 } });
    const loaded = await store.load();

    expect(saved.libraryFolders).toEqual(['D:/Media']);
    expect(loaded.playback.volume).toBe(0.5);
    expect(loaded.shortcuts.playPause).toBe('Space');
  });

  it('migrates legacy settings without overriding explicit online preferences', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'virelia-settings-'));
    const store = new SettingsStore(root);
    const filePath = path.join(root, 'settings.json');
    const { writeFile } = await import('node:fs/promises');

    await writeFile(filePath, JSON.stringify({
      metadata: { enableOnlineLookup: false, preferredLanguage: 'auto' },
      discovery: { disableOnlineDiscovery: true, enableOnlineCatalog: false },
      subtitles: { autoGenerate: false },
    }), 'utf-8');

    const loaded = await store.load();

    expect(loaded.settingsSchemaVersion).toBe(5);
    expect(loaded.metadata.enableOnlineLookup).toBe(false);
    expect(loaded.discovery.disableOnlineDiscovery).toBe(true);
    expect(loaded.discovery.enableOnlineCatalog).toBe(false);
    expect(loaded.subtitles.autoGenerate).toBe(true);
    expect(loaded.uiSounds.enabled).toBe(false);
  });
});
