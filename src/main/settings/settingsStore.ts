import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultSettings } from '../../shared/defaults';
import type { AppSettings, PlaybackEngineName, RepeatMode, UiLanguagePreference } from '../../shared/types';
import {
  defaultUiSoundsSettings,
  type UiSoundPlaybackPolicy,
  type UiSoundsSettings,
} from '../../shared/uiAudioTypes';

type SettingsPatch = Partial<Omit<AppSettings, 'playback' | 'subtitles' | 'visualizer' | 'shortcuts' | 'monetization' | 'metadata' | 'discovery' | 'onboarding' | 'characterRecognition' | 'uiSounds'>> & {
  playback?: Partial<AppSettings['playback']>;
  subtitles?: Partial<AppSettings['subtitles']>;
  visualizer?: Partial<AppSettings['visualizer']>;
  shortcuts?: Partial<AppSettings['shortcuts']>;
  monetization?: Partial<AppSettings['monetization']>;
  metadata?: Partial<AppSettings['metadata']>;
  discovery?: Partial<AppSettings['discovery']>;
  onboarding?: Partial<AppSettings['onboarding']>;
  characterRecognition?: Partial<AppSettings['characterRecognition']>;
  uiSounds?: Partial<UiSoundsSettings> & { categories?: Partial<UiSoundsSettings['categories']> };
};

function mergeSettings(base: AppSettings, patch: SettingsPatch): AppSettings {
  return sanitizeSettings({
    ...base,
    ...patch,
    playback: { ...base.playback, ...patch.playback },
    subtitles: { ...base.subtitles, ...patch.subtitles },
    visualizer: { ...base.visualizer, ...patch.visualizer },
    shortcuts: { ...base.shortcuts, ...patch.shortcuts },
    monetization: { ...base.monetization, ...patch.monetization },
    metadata: { ...base.metadata, ...patch.metadata },
    discovery: { ...base.discovery, ...patch.discovery },
    onboarding: { ...base.onboarding, ...patch.onboarding },
    characterRecognition: { ...base.characterRecognition, ...patch.characterRecognition },
    uiSounds: sanitizeUiSounds({ ...base.uiSounds, ...patch.uiSounds, categories: { ...base.uiSounds.categories, ...patch.uiSounds?.categories } }),
  });
}

function isUiLanguage(value: unknown): value is UiLanguagePreference {
  return value === 'auto' || value === 'en' || value === 'ru';
}

function isEngine(value: unknown): value is PlaybackEngineName {
  return value === 'mpv' || value === 'html5-fallback';
}

function isRepeat(value: unknown): value is RepeatMode {
  return value === 'off' || value === 'one' || value === 'all';
}

const DEFAULT_CHARACTER_HTTP_URL = 'http://127.0.0.1:8787';

function sanitizeCharacterRecognition(
  input?: AppSettings['characterRecognition']
): AppSettings['characterRecognition'] {
  const mode = input?.mode;
  const backendUrl = String(input?.backendUrl ?? '').trim();
  if (mode === 'mock') {
    return { mode: 'mock', backendUrl: '' };
  }
  if (mode === 'local-http' && backendUrl && backendUrl !== DEFAULT_CHARACTER_HTTP_URL) {
    return { mode: 'local-http', backendUrl };
  }
  return { mode: 'disabled', backendUrl: '' };
}

function isPlaybackPolicy(value: unknown): value is UiSoundPlaybackPolicy {
  return value === 'always' || value === 'important_only' || value === 'disabled';
}

function sanitizeUiSounds(input?: Partial<UiSoundsSettings>): UiSoundsSettings {
  const defaults = defaultUiSoundsSettings();
  const categories = {
    ...defaults.categories,
    ...input?.categories,
  };
  const volume = Number.isFinite(input?.volume) ? Math.max(0, Math.min(1, input!.volume!)) : defaults.volume;
  return {
    enabled: input?.enabled !== undefined ? Boolean(input.enabled) : defaults.enabled,
    volume,
    duringPlayback: isPlaybackPolicy(input?.duringPlayback) ? input.duringPlayback : defaults.duringPlayback,
    categories: {
      playback: Boolean(categories.playback),
      navigation: Boolean(categories.navigation),
      queue: Boolean(categories.queue),
      notifications: Boolean(categories.notifications),
      warnings: Boolean(categories.warnings),
    },
  };
}

const CURRENT_SETTINGS_SCHEMA_VERSION = 5;

function migrateLoadedSettings(raw: Record<string, unknown>): SettingsPatch {
  const patch: SettingsPatch = {};
  const schemaVersion = typeof raw.settingsSchemaVersion === 'number'
    ? raw.settingsSchemaVersion
    : 1;

  if (schemaVersion < CURRENT_SETTINGS_SCHEMA_VERSION) {
    const rawMetadata = raw.metadata as Record<string, unknown> | undefined;
    const rawDiscovery = raw.discovery as Record<string, unknown> | undefined;
    const rawShell = raw.shell as Record<string, unknown> | undefined;
    const discoveryDisabled = rawDiscovery?.disableOnlineDiscovery === true;

    patch.settingsSchemaVersion = CURRENT_SETTINGS_SCHEMA_VERSION;
    if (schemaVersion < 5) {
      patch.shell = {
        pinSidebar: Boolean(rawShell?.pinSidebar),
        alwaysShowRightPanel: Boolean(rawShell?.alwaysShowRightPanel),
      };
    }
    patch.metadata = {
      ...(rawMetadata ?? {}),
      ...(patch.metadata ?? {}),
      enableOnlineLookup: rawMetadata && 'enableOnlineLookup' in rawMetadata
        ? Boolean(rawMetadata.enableOnlineLookup)
        : true,
      metadataRefreshOnTitleOpen: true,
      metadataCardsSimpleMode: schemaVersion < 4
        ? false
        : (rawMetadata && 'metadataCardsSimpleMode' in rawMetadata
          ? Boolean(rawMetadata.metadataCardsSimpleMode)
          : false),
    };
    patch.discovery = {
      ...(rawDiscovery ?? {}),
      ...(patch.discovery ?? {}),
      disableOnlineDiscovery: rawDiscovery && 'disableOnlineDiscovery' in rawDiscovery
        ? Boolean(rawDiscovery.disableOnlineDiscovery)
        : false,
      enableOnlineCatalog: rawDiscovery && 'enableOnlineCatalog' in rawDiscovery
        ? Boolean(rawDiscovery.enableOnlineCatalog)
        : !discoveryDisabled,
      enableCatalogSearch: true,
      enableDiscoverCatalogRails: true,
      enableReviews: true,
      enableRecommendations: true,
    };
    patch.subtitles = {
      ...(patch.subtitles ?? {}),
      autoLoad: true,
      autoGenerate: true,
      progressiveSubtitleGeneration: true,
      usePartialGeneratedSubtitles: true,
      subtitleTimelineCoverage: true,
      ...(schemaVersion < 4 ? { showSoundLabels: true } : {}),
    };
    patch.visualizer = { ...(patch.visualizer ?? {}), enabled: true };
    if (schemaVersion < 4 && !discoveryDisabled) {
      patch.uiSounds = { enabled: false };
      const rawCharacter = raw.characterRecognition as Record<string, unknown> | undefined;
      if (!rawCharacter || rawCharacter.mode === 'disabled' || rawCharacter.mode === undefined) {
        patch.characterRecognition = { mode: 'mock', backendUrl: '' };
      }
    }
  }

  if (schemaVersion < 3 || !raw.onboarding) {
    patch.onboarding = {
      ...(patch.onboarding ?? {}),
      welcomeCompleted: false,
    };
  }

  const metadata = raw.metadata as Record<string, unknown> | undefined;
  if (metadata && !('enableOnlineLookup' in metadata)) {
    patch.metadata = { ...(patch.metadata ?? {}), enableOnlineLookup: true };
  }
  const subtitles = raw.subtitles as Record<string, unknown> | undefined;
  if (subtitles) {
    const subtitlePatch: Partial<AppSettings['subtitles']> = { ...(patch.subtitles ?? {}) };
    if (!('autoGenerate' in subtitles)) subtitlePatch.autoGenerate = true;
    if (!('progressiveSubtitleGeneration' in subtitles)) subtitlePatch.progressiveSubtitleGeneration = true;
    if (!('usePartialGeneratedSubtitles' in subtitles)) subtitlePatch.usePartialGeneratedSubtitles = true;
    if (!('subtitleTimelineCoverage' in subtitles)) subtitlePatch.subtitleTimelineCoverage = true;
    if (Object.keys(subtitlePatch).length > 0) {
      patch.subtitles = subtitlePatch;
    }
  }
  const characterRecognition = raw.characterRecognition as Record<string, unknown> | undefined;
  if (characterRecognition) {
    const mode = characterRecognition.mode;
    const url = String(characterRecognition.backendUrl ?? '').trim();
    if (mode === 'local-http' && (!url || url === DEFAULT_CHARACTER_HTTP_URL)) {
      patch.characterRecognition = { mode: 'disabled', backendUrl: '' };
    }
  }
  return patch;
}

function isWhisperModel(value: unknown): value is AppSettings['subtitles']['whisperModel'] {
  return value === 'tiny'
    || value === 'base'
    || value === 'small'
    || value === 'medium'
    || value === 'large-v3';
}

function isWhisperGpuMode(value: unknown): value is AppSettings['subtitles']['whisperGpu'] {
  return value === 'auto' || value === 'on' || value === 'off';
}

export function sanitizeSettings(input: AppSettings): AppSettings {
  const playback = {
    ...defaultSettings.playback,
    ...input.playback,
    volume: Number.isFinite(input.playback?.volume) ? input.playback.volume : defaultSettings.playback.volume,
    speed: Number.isFinite(input.playback?.speed) ? input.playback.speed : defaultSettings.playback.speed,
    repeat: isRepeat(input.playback?.repeat) ? input.playback.repeat : defaultSettings.playback.repeat,
    shuffle: Boolean(input.playback?.shuffle),
    muted: Boolean(input.playback?.muted),
    preferredEngine: isEngine(input.playback?.preferredEngine)
      ? input.playback.preferredEngine
      : defaultSettings.playback.preferredEngine,
    mpvPath: typeof input.playback?.mpvPath === 'string' ? input.playback.mpvPath : undefined
  };

  return {
    ...defaultSettings,
    ...input,
    settingsSchemaVersion: typeof input.settingsSchemaVersion === 'number'
      ? input.settingsSchemaVersion
      : defaultSettings.settingsSchemaVersion,
    theme: 'virelia-dark',
    uiLanguage: isUiLanguage(input.uiLanguage) ? input.uiLanguage : defaultSettings.uiLanguage,
    libraryFolders: Array.isArray(input.libraryFolders)
      ? input.libraryFolders.filter((folder): folder is string => typeof folder === 'string')
      : [],
    startWithWindows: Boolean(input.startWithWindows),
    minimizeToTray: Boolean(input.minimizeToTray),
    continueInBackground: Boolean(input.continueInBackground),
    playback,
    subtitles: {
      ...defaultSettings.subtitles,
      ...input.subtitles,
      autoLoad: input.subtitles?.autoLoad !== undefined
        ? Boolean(input.subtitles.autoLoad)
        : defaultSettings.subtitles.autoLoad,
      autoGenerate: input.subtitles?.autoGenerate !== undefined
        ? Boolean(input.subtitles.autoGenerate)
        : defaultSettings.subtitles.autoGenerate,
      whisperModel: isWhisperModel(input.subtitles?.whisperModel)
        ? input.subtitles.whisperModel
        : defaultSettings.subtitles.whisperModel,
      whisperGpu: isWhisperGpuMode(input.subtitles?.whisperGpu)
        ? input.subtitles.whisperGpu
        : defaultSettings.subtitles.whisperGpu,
      whisperGpuLayers: Number.isFinite(input.subtitles?.whisperGpuLayers)
        ? Math.max(1, Math.min(99, Math.round(input.subtitles!.whisperGpuLayers!)))
        : defaultSettings.subtitles.whisperGpuLayers,
    },
    visualizer: { ...defaultSettings.visualizer, ...input.visualizer },
    shortcuts: { ...defaultSettings.shortcuts, ...input.shortcuts },
    monetization: { ...defaultSettings.monetization, ...input.monetization },
    metadata: {
      ...defaultSettings.metadata,
      ...input.metadata,
      preferredLanguage: isUiLanguage(input.metadata?.preferredLanguage)
        ? input.metadata.preferredLanguage
        : defaultSettings.metadata.preferredLanguage,
      enableOnlineLookup: input.metadata?.enableOnlineLookup !== undefined
        ? Boolean(input.metadata.enableOnlineLookup)
        : defaultSettings.metadata.enableOnlineLookup,
      metadataRefreshOnTitleOpen: input.metadata?.metadataRefreshOnTitleOpen !== undefined
        ? Boolean(input.metadata.metadataRefreshOnTitleOpen)
        : defaultSettings.metadata.metadataRefreshOnTitleOpen ?? true,
      metadataCardsSimpleMode: input.metadata?.metadataCardsSimpleMode !== undefined
        ? Boolean(input.metadata.metadataCardsSimpleMode)
        : defaultSettings.metadata.metadataCardsSimpleMode ?? true
    },
    discovery: {
      ...defaultSettings.discovery,
      ...input.discovery,
      region: typeof input.discovery?.region === 'string' ? input.discovery.region : defaultSettings.discovery.region,
      preferredServices: Array.isArray(input.discovery?.preferredServices)
        ? input.discovery.preferredServices.filter((s): s is string => typeof s === 'string')
        : defaultSettings.discovery.preferredServices,
      enableReviews: input.discovery?.enableReviews !== undefined
        ? Boolean(input.discovery.enableReviews)
        : defaultSettings.discovery.enableReviews,
      enableRecommendations: input.discovery?.enableRecommendations !== undefined
        ? Boolean(input.discovery.enableRecommendations)
        : defaultSettings.discovery.enableRecommendations,
      autoMatchConfidenceThreshold: typeof input.discovery?.autoMatchConfidenceThreshold === 'number'
        ? Math.max(0, Math.min(1, input.discovery.autoMatchConfidenceThreshold))
        : defaultSettings.discovery.autoMatchConfidenceThreshold,
      askBeforeOpeningBrowser: input.discovery?.askBeforeOpeningBrowser !== undefined
        ? Boolean(input.discovery.askBeforeOpeningBrowser)
        : defaultSettings.discovery.askBeforeOpeningBrowser,
      searchEngine: ['default', 'google', 'bing', 'duckduckgo', 'custom'].includes(String(input.discovery?.searchEngine))
        ? input.discovery!.searchEngine
        : defaultSettings.discovery.searchEngine,
      customSearchTemplate: typeof input.discovery?.customSearchTemplate === 'string'
        ? input.discovery.customSearchTemplate
        : defaultSettings.discovery.customSearchTemplate,
      disableOnlineDiscovery: input.discovery?.disableOnlineDiscovery !== undefined
        ? Boolean(input.discovery.disableOnlineDiscovery)
        : defaultSettings.discovery.disableOnlineDiscovery,
      enableOnlineCatalog: input.discovery?.enableOnlineCatalog !== undefined
        ? Boolean(input.discovery.enableOnlineCatalog)
        : defaultSettings.discovery.enableOnlineCatalog,
      primaryCatalogProvider: ['auto', 'anilist', 'tmdb'].includes(String(input.discovery?.primaryCatalogProvider))
        ? input.discovery!.primaryCatalogProvider
        : defaultSettings.discovery.primaryCatalogProvider,
      tmdbApiKey: typeof input.discovery?.tmdbApiKey === 'string'
        ? input.discovery.tmdbApiKey
        : defaultSettings.discovery.tmdbApiKey,
      gatewayBaseUrl: typeof input.discovery?.gatewayBaseUrl === 'string'
        ? input.discovery.gatewayBaseUrl
        : defaultSettings.discovery.gatewayBaseUrl,
      enableCatalogSearch: input.discovery?.enableCatalogSearch !== undefined
        ? Boolean(input.discovery.enableCatalogSearch)
        : defaultSettings.discovery.enableCatalogSearch,
      enableDiscoverCatalogRails: input.discovery?.enableDiscoverCatalogRails !== undefined
        ? Boolean(input.discovery.enableDiscoverCatalogRails)
        : defaultSettings.discovery.enableDiscoverCatalogRails,
      includeAdultContent: input.discovery?.includeAdultContent !== undefined
        ? Boolean(input.discovery.includeAdultContent)
        : defaultSettings.discovery.includeAdultContent,
    },
    shell: {
      ...defaultSettings.shell,
      ...input.shell,
      pinSidebar: Boolean(input.shell?.pinSidebar),
      alwaysShowRightPanel: Boolean(input.shell?.alwaysShowRightPanel),
    },
    onboarding: {
      ...defaultSettings.onboarding,
      ...input.onboarding,
      welcomeCompleted: Boolean(input.onboarding?.welcomeCompleted),
      completedAt: typeof input.onboarding?.completedAt === 'string'
        ? input.onboarding.completedAt
        : undefined,
      recommendedWhisperModel: isWhisperModel(input.onboarding?.recommendedWhisperModel)
        ? input.onboarding.recommendedWhisperModel
        : undefined,
      benchmarkTier: ['low', 'balanced', 'high'].includes(String(input.onboarding?.benchmarkTier))
        ? input.onboarding!.benchmarkTier
        : undefined,
      downloadedWhisperModel: isWhisperModel(input.onboarding?.downloadedWhisperModel)
        ? input.onboarding.downloadedWhisperModel
        : undefined,
    },
    characterRecognition: sanitizeCharacterRecognition(input.characterRecognition),
    uiSounds: sanitizeUiSounds(input.uiSounds),
  };
}

export class SettingsStore {
  private readonly filePath: string;

  constructor(private readonly rootPath: string) {
    this.filePath = path.join(rootPath, 'settings.json');
  }

  async load(): Promise<AppSettings> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const migration = migrateLoadedSettings(parsed);
      return mergeSettings(defaultSettings, { ...parsed, ...migration } as SettingsPatch);
    } catch {
      return defaultSettings;
    }
  }

  async save(patch: SettingsPatch): Promise<AppSettings> {
    const current = await this.load();
    const next = mergeSettings(current, patch);
    await mkdir(this.rootPath, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }

  async replace(settings: AppSettings): Promise<AppSettings> {
    const next = sanitizeSettings(settings);
    await mkdir(this.rootPath, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }
}
