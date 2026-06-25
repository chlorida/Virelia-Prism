export type SubtitleSource = 'embedded' | 'external' | 'generated';
export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'ssa' | 'sub';

export type SubtitleGenerationStatus =
  | 'idle'
  | 'queued'
  | 'preparing'
  | 'extracting_audio'
  | 'transcribing'
  | 'translating'
  | 'writing'
  | 'validating'
  | 'partial_ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface SubtitleCoverageRange {
  start: number;
  end: number;
  status: 'ready' | 'generating' | 'failed';
}

export interface SubtitleGenerationProgressDetail {
  fileId?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  backend?: string;
  model?: string;
  status?: SubtitleGenerationStatus;
  startedAt?: number;
  updatedAt?: number;
  durationSeconds?: number;
  generatedUntilSeconds?: number;
  generatedCueCount?: number;
  validCueCount?: number;
  coverageRatio?: number;
  currentSegmentStart?: number;
  currentSegmentEnd?: number;
  partialTrackId?: string;
  liveSubtitlesSupported?: boolean;
  coverageRanges?: SubtitleCoverageRange[];
  contiguousFromStart?: boolean;
  rangeCount?: number;
}

export type ExternalSubtitleScanStatus = 'idle' | 'scanning' | 'found' | 'notFound' | 'failed';

export type GenerationAvailabilityReason =
  | 'ready'
  | 'unavailable_no_ffmpeg'
  | 'unavailable_no_backend'
  | 'unavailable_no_model'
  | 'unavailable_no_translation';

/** Language code for subtitle output (no auto). */
export type TargetSubtitleLanguage = 'en' | 'ru' | 'ja' | 'de' | 'fr' | 'es' | 'ko' | 'zh';

/** Speech language for transcription (auto = detect). */
export type SourceAudioLanguage = 'auto' | TargetSubtitleLanguage;

/** @deprecated Use TargetSubtitleLanguage */
export type SubtitlePreferredLanguage = SourceAudioLanguage;

export type SubtitleSaveLocation = 'cache' | 'next-to-video';
export type WhisperModelSize = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3';

export type TranscriptionBackendKind = 'disabled' | 'whisper-cpp' | 'faster-whisper' | 'custom-command';

export interface VideoAudioStream {
  index: number;
  isDefault: boolean;
  language?: string;
  title?: string;
  codec?: string;
  channels?: number;
  sampleRate?: number;
  label: string;
  isCommentary: boolean;
}

export interface SubtitleGenerationDiagnostics {
  reason: string;
  message: string;
  videoDurationSec?: number;
  generatedCueCount?: number;
  coverageRatio?: number;
  selectedAudioStream?: string;
  audioLanguage?: string;
  audioDurationSec?: number;
  extractedAudioBytes?: number;
  transcriptionBackend: string;
  modelName: string;
  sourceLanguageMode: string;
  targetLanguage: string;
  recoveredCueCount?: number;
  coverageUntilSeconds?: number;
}

export type TranslationBackendKind = 'disabled' | 'builtin' | 'mock' | 'local-command' | 'local-http' | 'custom-api';

export interface SubtitleTranslationSettings {
  backend: TranslationBackendKind;
  command?: string;
  httpUrl?: string;
  apiKey?: string;
}

export type TranslateExistingSubtitlesRequest = {
  videoId: string;
  videoPath: string;
  sourceSubtitlePath: string;
  sourceLanguage: 'auto' | string;
  targetLanguage: string;
  outputFormat?: 'ass' | 'vtt';
  franchiseKey?: string;
  preserveStyles?: boolean;
  preserveSpeakerMetadata?: boolean;
  markForeignSpeech?: boolean;
  showSoundLabels?: boolean;
  speakerColorMode?: 'auto' | 'franchise' | 'singleColor' | 'off';
  nameStyle?: 'romanized' | 'localized_ru';
};

export type TranslateSubtitlesRequest = {
  videoPath: string;
  sourceSubtitleTrackId: string;
  sourceSubtitlePath?: string;
  sourceLanguage: 'auto' | string;
  targetLanguage: string;
  franchiseKey?: string;
  preserveHonorifics?: boolean;
  markForeignSpeech?: boolean;
  speakerColorMode?: 'auto' | 'franchise' | 'singleColor' | 'off';
  outputFormat?: 'ass' | 'vtt';
};

export type CharacterColorSource =
  | 'user-override'
  | 'manual-glossary'
  | 'franchise-default'
  | 'character-profile'
  | 'visual-analysis'
  | 'name-semantic'
  | 'role-heuristic'
  | 'speaker-palette'
  | 'fallback';

export type CharacterColorConfidence = 'high' | 'medium' | 'low';

export interface CharacterSubtitleColor {
  color: string;
  outlineColor: string;
  source: CharacterColorSource;
  confidence: CharacterColorConfidence;
  reason?: string;
  shadow?: string;
  texture?: string;
}

export interface GetCharacterColorRequest {
  franchiseKey?: string;
  videoKey: string;
  videoPath?: string;
  characterName?: string;
  speakerId?: string;
  context?: {
    cueTimes?: number[];
    subtitleStyleName?: string;
    source?: string;
  };
}

export interface GetCharacterColorResponse {
  color: string;
  outlineColor: string;
  source: string;
  confidence: string;
  reason: string;
  shadow?: string;
  texture?: string;
  characterId?: string;
}

export type TranslateSubtitlesResponse = {
  status: 'ok' | 'failed';
  outputPath?: string;
  trackId?: string;
  targetLanguage: string;
  sourceLanguage?: string;
  cueCount: number;
  translatedCueCount: number;
  detectedSpeakers?: string[];
  usedGlossary?: string;
  usedCharacterColors?: boolean;
  error?: string;
};

export type SubtitleTrackStatus = 'valid' | 'invalid' | 'loading' | 'failed';

export interface SubtitleTrack {
  id: string;
  videoId: string;
  /** Canonical absolute video path this track belongs to. */
  videoPath: string;
  /** Stable hash of normalized video path (`media_id_for_path`). */
  videoKey: string;
  source: SubtitleSource;
  language: string;
  languageLabel: string;
  label: string;
  format: SubtitleFormat;
  path?: string;
  embeddedTrackIndex?: number;
  generatedAt?: number;
  confidence?: number;
  isDefault?: boolean;
  generationValid?: boolean;
  generationInvalidReason?: string;
  generationPipelineVersion?: number;
  isPartial?: boolean;
  isLiveUpdating?: boolean;
  generatedUntilSeconds?: number;
  recoveredFromFailure?: boolean;
  /** Runtime playback status (not persisted). */
  status?: SubtitleTrackStatus;
  error?: string;
  invalidReason?: string;
}

export interface SubtitleState {
  videoId: string | null;
  videoPath: string | null;
  videoKey: string | null;
  availableTracks: SubtitleTrack[];
  selectedTrackId: string | null;
  preferredLanguage: SubtitlePreferredLanguage;
  /** Language shown in generated subtitles. */
  targetSubtitleLanguage: TargetSubtitleLanguage;
  /** Speech language for transcription (advanced). */
  sourceAudioLanguage: SourceAudioLanguage;
  /** Prefix foreign-language lines in subtitles. */
  markForeignSpeech: boolean;
  /** Show [MUSIC] / sound labels in generated subtitles. */
  showSoundLabels: boolean;
  /** Character name spelling for generated subtitles. */
  nameStyle: 'romanized' | 'localized_ru';
  externalScanStatus: ExternalSubtitleScanStatus;
  generationAvailability: GenerationAvailabilityReason;
  generationStatus: SubtitleGenerationStatus;
  generationProgress?: number;
  generationMessage?: string;
  generationError?: string;
  generationErrorDetails?: string;
  generationDiagnostics?: SubtitleGenerationDiagnostics | null;
  generationDetail?: SubtitleGenerationProgressDetail | null;
  coverageRanges?: SubtitleCoverageRange[];
  selectedAudioStreamIndex?: number | null;
  availableAudioStreams?: VideoAudioStream[];
  playbackError?: string;
  playbackErrorKind?: 'parse' | 'validation' | 'runtime' | 'stale' | 'read';
  playbackErrorDetails?: string;
  /** Track id that owns `playbackError` (must match selected track to show globally). */
  playbackErrorTrackId?: string | null;
  /** Short-lived warning when user tries to select an invalid track. */
  selectionWarning?: string;
  /** User chose Off during live generation; suppress auto-select until they opt back in. */
  userDisabledLiveSubtitles?: boolean;
  ffmpegAvailable?: boolean;
  translationAvailable?: boolean;
  loading: boolean;
}

export const SUBTITLE_TARGET_LANGUAGE_OPTIONS: { value: TargetSubtitleLanguage; labelKey: string }[] = [
  { value: 'en', labelKey: 'subtitles.lang.en' },
  { value: 'ru', labelKey: 'subtitles.lang.ru' },
  { value: 'ja', labelKey: 'subtitles.lang.ja' },
  { value: 'de', labelKey: 'subtitles.lang.de' },
  { value: 'fr', labelKey: 'subtitles.lang.fr' },
  { value: 'es', labelKey: 'subtitles.lang.es' },
  { value: 'ko', labelKey: 'subtitles.lang.ko' },
  { value: 'zh', labelKey: 'subtitles.lang.zh' },
];

export const SUBTITLE_SOURCE_LANGUAGE_OPTIONS: { value: SourceAudioLanguage; labelKey: string }[] = [
  { value: 'auto', labelKey: 'subtitles.lang.autoDetect' },
  ...SUBTITLE_TARGET_LANGUAGE_OPTIONS,
];

/** @deprecated Use SUBTITLE_TARGET_LANGUAGE_OPTIONS */
export const SUBTITLE_LANGUAGE_OPTIONS = SUBTITLE_SOURCE_LANGUAGE_OPTIONS;
