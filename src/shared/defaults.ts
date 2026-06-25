import type { AppSettings, MediaItem, Playlist, QueueItem } from './types';
import { defaultUiSoundsSettings } from './uiAudioTypes';

export const defaultSettings: AppSettings = {
  settingsSchemaVersion: 5,
  theme: 'virelia-dark',
  uiLanguage: 'auto',
  startWithWindows: false,
  minimizeToTray: true,
  continueInBackground: true,
  libraryFolders: [],
  playback: {
    volume: 0.74,
    speed: 1,
    muted: false,
    repeat: 'off',
    shuffle: false,
    preferredEngine: 'html5-fallback'
  },
  subtitles: {
    defaultLanguage: 'auto',
    preferredLanguage: 'auto',
    timingOffsetMs: 0,
    autoLoad: true,
    autoGenerate: true,
    progressiveSubtitleGeneration: true,
    usePartialGeneratedSubtitles: true,
    subtitleTimelineCoverage: true,
    generatedFormat: 'vtt',
    saveLocation: 'cache',
    whisperModel: 'base',
    whisperGpu: 'auto',
    whisperGpuLayers: 99,
    translation: {
      backend: 'builtin',
    },
    speakerColors: 'auto',
    nameStyle: 'localized',
    showSoundLabels: true
  },
  metadata: {
    preferredLanguage: 'auto',
    enableOnlineLookup: true,
    metadataRefreshOnTitleOpen: true,
    metadataCardsSimpleMode: false
  },
  discovery: {
    region: 'auto',
    preferredServices: [],
    enableReviews: true,
    enableRecommendations: true,
    autoMatchConfidenceThreshold: 0.72,
    askBeforeOpeningBrowser: true,
    searchEngine: 'default',
    customSearchTemplate: 'https://www.google.com/search?q={query}',
    disableOnlineDiscovery: false,
    enableOnlineCatalog: true,
    primaryCatalogProvider: 'auto',
    tmdbApiKey: '',
    gatewayBaseUrl: '',
    enableCatalogSearch: true,
    enableDiscoverCatalogRails: true,
    includeAdultContent: false,
  },
  shell: {
    pinSidebar: false,
    alwaysShowRightPanel: false,
  },
  onboarding: {
    welcomeCompleted: false
  },
  characterRecognition: {
    mode: 'mock',
    backendUrl: ''
  },
  visualizer: {
    enabled: true,
    style: 'prism-wave'
  },
  shortcuts: {
    playPause: 'Space',
    globalSearch: 'Ctrl+P',
    previous: 'ArrowLeft',
    next: 'ArrowRight',
    addToQueue: 'Q',
    favorite: 'F',
    miniPlayer: 'Ctrl+Shift+M',
    settings: 'Ctrl+,'
  },
  monetization: {
    tier: 'free',
    premiumThemes: false,
    advancedSmartPlaylists: false,
    additionalVisualizers: false,
    exclusiveCustomization: false,
    boostyIntegrationPlaceholder: true
  },
  uiSounds: defaultUiSoundsSettings()
};

export const demoMedia: MediaItem[] = [
  {
    id: 'demo-audio-aurora',
    filePath: '',
    fileName: 'Aurora Drift.flac',
    folder: 'Virelia Demo',
    title: 'Aurora Drift',
    artist: 'Virelia Studio',
    album: 'Prism Sessions',
    tags: ['demo', 'ambient', 'favorite'],
    kind: 'audio',
    durationSeconds: 281,
    addedAt: new Date().toISOString(),
    favorite: true
  },
  {
    id: 'demo-video-nebula',
    filePath: '',
    fileName: 'Nebula Window.mp4',
    folder: 'Virelia Demo',
    title: 'Nebula Window',
    artist: 'Virelia Motion',
    album: 'Visual Tests',
    tags: ['demo', 'video'],
    kind: 'video',
    durationSeconds: 734,
    addedAt: new Date().toISOString(),
    favorite: false
  },
  {
    id: 'demo-audio-midnight',
    filePath: '',
    fileName: 'Midnight Interface.mp3',
    folder: 'Virelia Demo',
    title: 'Midnight Interface',
    artist: 'Virelia Studio',
    album: 'Prism Sessions',
    tags: ['demo', 'recent'],
    kind: 'audio',
    durationSeconds: 215,
    addedAt: new Date().toISOString(),
    lastPlayedAt: new Date().toISOString(),
    favorite: false
  }
];

export const demoPlaylists: Playlist[] = [
  {
    id: 'smart-recently-added',
    name: 'Recently Added',
    mediaIds: [],
    smart: { type: 'recently-added', label: 'Fresh imports' }
  },
  {
    id: 'smart-favorites',
    name: 'Favorites',
    mediaIds: [],
    smart: { type: 'favorites', label: 'Loved media' }
  }
];

export const demoQueue: QueueItem[] = [
  {
    id: 'queue-demo-audio-aurora',
    mediaId: 'demo-audio-aurora',
    pinned: true,
    addedAt: new Date().toISOString()
  }
];
