import type {
  SubtitlePreferredLanguage,
  SubtitleSaveLocation,
  SubtitleTranslationSettings,
  WhisperModelSize,
} from './subtitleTypes';

export type MediaKind = 'audio' | 'video';

export type SortMode = 'recent' | 'alphabetical' | 'duration' | 'folder';

export type MediaFilter = 'all' | 'audio' | 'video' | 'favorites' | 'recent';

export type RepeatMode = 'off' | 'one' | 'all';

export type PlaybackEngineName = 'mpv' | 'html5-fallback';

export interface MediaItem {
  id: string;
  filePath: string;
  fileName: string;
  folder: string;
  /** Short folder label for list UI (last path segments). */
  folderLabel?: string;
  /** Lowercased search blob built at library ingest. */
  searchText?: string;
  title: string;
  artist?: string;
  album?: string;
  tags: string[];
  kind: MediaKind;
  /** File size in bytes — used for incremental disk sync. */
  size?: number;
  durationSeconds?: number;
  addedAt: string;
  /** Modification time (epoch ms) when known from disk index. */
  mtimeMs?: number;
  lastPlayedAt?: string;
  favorite: boolean;
  resumePositionSeconds?: number;
  albumArtPath?: string;
}

export interface Playlist {
  id: string;
  name: string;
  folder?: string;
  mediaIds: string[];
  smart?: SmartPlaylistRule;
}

export interface SmartPlaylistRule {
  type: 'recently-added' | 'favorites' | 'longest-tracks' | 'unwatched-videos' | 'last-played';
  label: string;
}

export interface QueueItem {
  id: string;
  mediaId: string;
  pinned: boolean;
  addedAt: string;
}

export interface ShortcutMap {
  playPause: string;
  globalSearch: string;
  previous: string;
  next: string;
  addToQueue: string;
  favorite: string;
  miniPlayer: string;
  settings: string;
}

export interface MonetizationCapabilities {
  tier: 'free' | 'pro' | 'supporter';
  premiumThemes: boolean;
  advancedSmartPlaylists: boolean;
  additionalVisualizers: boolean;
  exclusiveCustomization: boolean;
  boostyIntegrationPlaceholder: boolean;
}

export type UiLanguagePreference = 'auto' | 'en' | 'ru';

export type SearchEngineKind = 'default' | 'google' | 'bing' | 'duckduckgo' | 'custom';

export type CatalogProviderId = 'auto' | 'anilist' | 'tmdb';

export interface DiscoverySettings {
  region: string;
  preferredServices: string[];
  enableReviews: boolean;
  enableRecommendations: boolean;
  autoMatchConfidenceThreshold: number;
  askBeforeOpeningBrowser: boolean;
  searchEngine: SearchEngineKind;
  customSearchTemplate?: string;
  disableOnlineDiscovery: boolean;
  /** Enable online metadata catalog (search + discover rails). */
  enableOnlineCatalog: boolean;
  /** @deprecated Gateway handles provider routing; kept for migration only. */
  primaryCatalogProvider?: CatalogProviderId;
  /** @deprecated Secrets live on Prism Metadata Gateway, not in the desktop app. */
  tmdbApiKey?: string;
  /** Optional dev/advanced override for Prism Metadata Gateway base URL. */
  gatewayBaseUrl?: string;
  enableCatalogSearch: boolean;
  enableDiscoverCatalogRails: boolean;
  includeAdultContent: boolean;
}

export type OnboardingBenchmarkTier = 'low' | 'balanced' | 'high';

export interface OnboardingSettings {
  welcomeCompleted: boolean;
  completedAt?: string;
  recommendedWhisperModel?: WhisperModelSize;
  benchmarkTier?: OnboardingBenchmarkTier;
  downloadedWhisperModel?: WhisperModelSize;
}

export interface ShellSettings {
  pinSidebar: boolean;
  alwaysShowRightPanel: boolean;
}

export interface AppSettings {
  /** Bumped when built-in default feature flags change; drives one-time settings migration. */
  settingsSchemaVersion?: number;
  theme: 'virelia-dark';
  uiLanguage: UiLanguagePreference;
  startWithWindows: boolean;
  minimizeToTray: boolean;
  continueInBackground: boolean;
  libraryFolders: string[];
  playback: {
    volume: number;
    speed: number;
    muted: boolean;
    repeat: RepeatMode;
    shuffle: boolean;
    preferredEngine: PlaybackEngineName;
    mpvPath?: string;
    /** smart | always-watch | music-audio-first */
    videoOpenBehavior?: 'smart' | 'always-watch' | 'music-audio-first';
  };
  subtitles: {
    /** @deprecated use preferredLanguage */
    defaultLanguage: string;
    preferredLanguage: SubtitlePreferredLanguage;
    timingOffsetMs: number;
    autoLoad: boolean;
    autoGenerate: boolean;
    generatedFormat: 'vtt' | 'srt' | 'ass';
    saveLocation: SubtitleSaveLocation;
    whisperModel: WhisperModelSize;
    /** auto | on | off — GPU acceleration for whisper.cpp (-ngl). */
    whisperGpu?: 'auto' | 'on' | 'off';
    /** Number of model layers on GPU (1–99). */
    whisperGpuLayers?: number;
    transcriptionBackend?: import('./subtitleTypes').TranscriptionBackendKind;
    customModelPath?: string;
    translation: SubtitleTranslationSettings;
    speakerColors: 'off' | 'auto' | 'franchise';
    nameStyle: 'localized' | 'original';
    showSoundLabels: boolean;
    progressiveSubtitleGeneration?: boolean;
    usePartialGeneratedSubtitles?: boolean;
    subtitleTimelineCoverage?: boolean;
  };
  /** Smart metadata / localization preferences */
  metadata: {
    preferredLanguage: UiLanguagePreference;
    enableOnlineLookup: boolean;
    metadataRefreshOnTitleOpen?: boolean;
    metadataCardsSimpleMode?: boolean;
  };
  discovery: DiscoverySettings;
  shell: ShellSettings;
  onboarding: OnboardingSettings;
  characterRecognition: import('./characterRecognitionTypes').CharacterRecognitionSettings;
  visualizer: {
    enabled: boolean;
    style: 'prism-wave' | 'spectrum-glow';
  };
  shortcuts: ShortcutMap;
  monetization: MonetizationCapabilities;
  uiSounds: import('./uiAudioTypes').UiSoundsSettings;
}

export interface EngineStatus {
  engine: PlaybackEngineName;
  available: boolean;
  message: string;
  executablePath?: string;
}

export interface PlayMediaOptions {
  forceEngine?: PlaybackEngineName;
  autoPlay?: boolean;
}

export interface PlaybackCommandResult {
  accepted: boolean;
  engineStatus: EngineStatus;
  rendererPlayback: boolean;
}

export interface PlaybackState {
  currentMediaId?: string;
  playing: boolean;
  positionSeconds: number;
  volume: number;
  speed: number;
  repeat: RepeatMode;
  shuffle: boolean;
  engineStatus: EngineStatus;
}

export interface LibrarySnapshotCounts {
  all: number;
  audio: number;
  video: number;
}

export interface LibraryScanResult {
  folders: string[];
  media: MediaItem[];
  scannedAt: string;
  counts?: LibrarySnapshotCounts;
  mediaIndexVersion?: number;
  /** Folder was already in library settings — no new scan needed. */
  folderAlreadyIndexed?: boolean;
  /** Import path stats when only new items are returned. */
  importStats?: { added: number; skipped: number };
}

export interface SearchOptions {
  query: string;
  filter: MediaFilter;
  sort: SortMode;
}
