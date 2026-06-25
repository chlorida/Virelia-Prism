import type { AppInfo, ThumbnailApiRecord } from '../../shared/prismApi.types';
import type { TitleMetadataImageResult, TitleMetadataRecord } from '../../shared/titleMetadataTypes';
import type { SubtitleTrack, WhisperModelSize } from '../../shared/subtitleTypes';
import type { AppSettings, LibraryScanResult, MediaItem } from '../../shared/types';
import type { ParsedMediaIdentity } from './mediaIntelligence/types';

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(command, args);
}

export interface TauriScanResult {
  items: MediaItem[];
  added: number;
  skipped: number;
  errors: string[];
}

export interface ScanProgressPayload {
  currentPath: string;
  scanned: number;
  added: number;
  skipped: number;
  total?: number | null;
  done: boolean;
}

export interface ValidationResult {
  valid: boolean;
  exists: boolean;
  kind?: 'audio' | 'video';
  error?: string;
}

export interface WatchFoldersResult {
  enabled: boolean;
  message: string;
}

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>('get_app_info');
}

export function openExternalUrl(url: string): Promise<void> {
  return invoke<void>('open_url', { url }).catch(() => {
    window.open(url, '_blank', 'noopener,noreferrer');
  });
}

export function loadSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('load_settings');
}

export function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return invoke<AppSettings>('save_settings', { patch });
}

export function scanFolder(path: string): Promise<TauriScanResult> {
  return invoke<TauriScanResult>('scan_folder', { path });
}

export function getLibrary(): Promise<MediaItem[]> {
  return invoke<MediaItem[]>('get_library');
}

export interface TauriCachedLibrary {
  folders: string[];
  media: MediaItem[];
  scannedAt: string;
  counts: { all: number; audio: number; video: number };
  source?: string;
}

export function loadLibraryCached(folders: string[]): Promise<TauriCachedLibrary | null> {
  return invoke<TauriCachedLibrary | null>('load_library_cached', { folders });
}

export interface LibraryBootPaths {
  appDataDir: string;
  snapshotFile: string;
  snapshotBackupFile: string;
  legacyCacheFile: string;
}

export function getLibraryBootPaths(): Promise<LibraryBootPaths> {
  return invoke<LibraryBootPaths>('get_library_boot_paths');
}

export function saveLibrarySnapshot(): Promise<void> {
  return invoke<void>('save_library_snapshot');
}

export function clearLibrarySnapshot(): Promise<void> {
  return invoke<void>('clear_library_snapshot');
}

export function validateMediaPath(path: string): Promise<ValidationResult> {
  return invoke<ValidationResult>('validate_media_path', { path });
}

export function importMediaPaths(paths: string[]): Promise<LibraryScanResult> {
  return invoke<LibraryScanResult>('import_media_paths', { paths });
}

export function removeFolder(path: string): Promise<void> {
  return invoke<void>('remove_folder', { path });
}

export function watchFolders(paths: string[]): Promise<WatchFoldersResult> {
  return invoke<WatchFoldersResult>('watch_folders', { paths });
}

export async function pickFolder(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected: string | string[] | null = await open({ directory: true, multiple: false });
  if (!selected) return null;
  if (typeof selected === 'string') return selected;
  return selected[0] ?? null;
}

/** Scan folders, merge into Rust cache, return full library snapshot. */
export async function scanFoldersToLibraryResult(folders?: string[]): Promise<LibraryScanResult> {
  const settings = await loadSettings();
  const targets = (folders?.length ? folders : settings.libraryFolders)
    .map((folder) => folder.trim())
    .filter(Boolean);

  if (targets.length === 0) {
    return {
      folders: settings.libraryFolders,
      media: await getLibrary(),
      scannedAt: new Date().toISOString()
    };
  }

  const errors: string[] = [];
  for (const folder of targets) {
    try {
      const result = await scanFolder(folder);
      if (result.errors.length > 0) errors.push(...result.errors);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const media = await getLibrary();
  const mergedFolders = [...new Set([...settings.libraryFolders, ...targets])];

  if (errors.length > 0 && media.length === 0) {
    throw new Error(errors[0] ?? 'Library scan failed');
  }

  return {
    folders: mergedFolders,
    media,
    scannedAt: new Date().toISOString()
  };
}

export type ScanProgressHandler = (payload: ScanProgressPayload) => void;
export type LibraryChangedHandler = (payload: LibraryScanResult) => void;

export async function onScanProgress(handler: ScanProgressHandler): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<ScanProgressPayload>('scan-progress', (event) => {
    handler(event.payload);
  });
  return unlisten;
}

export async function onLibraryChanged(handler: LibraryChangedHandler): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<LibraryScanResult>('library-changed', (event) => {
    handler(event.payload);
  });
  return unlisten;
}

export interface SubtitleDiscoveryDebug {
  videoPath: string;
  searchedDirs: string[];
  candidates: string[];
}

export interface DiscoverSubtitlesResult {
  tracks: SubtitleTrack[];
  debug?: SubtitleDiscoveryDebug;
}

export interface FfmpegStatus {
  available: boolean;
  ffmpegPath?: string;
  ffprobePath?: string;
  searched: string[];
  userMessage?: string;
}

export function getFfmpegStatus(): Promise<FfmpegStatus> {
  return invoke<FfmpegStatus>('get_ffmpeg_status');
}

export interface SubtitleGenerationAvailability {
  canGenerate: boolean;
  ffmpegAvailable: boolean;
  whisperCliAvailable: boolean;
  whisperModelAvailable: boolean;
  whisperModelName: string;
  whisperAvailable: boolean;
  ffmpegPath?: string;
  whisperCliPath?: string;
  whisperModelPath?: string;
  whisperModelHint?: string;
  translationAvailable: boolean;
  whisperGpuMode?: 'auto' | 'on' | 'off' | string;
  whisperGpuAvailable?: boolean;
  whisperGpuBackend?: string;
  whisperGpuLayers?: number;
  reason: 'ready' | 'unavailable_no_ffmpeg' | 'unavailable_no_backend' | 'unavailable_no_model';
}

export function listWhisperModels(): Promise<string[]> {
  return invoke<string[]>('list_whisper_models');
}

export interface SetupResourceStatus {
  ffmpegAvailable: boolean;
  whisperCliAvailable: boolean;
  installedModels: string[];
  ffmpegPath?: string;
  whisperCliPath?: string;
}

export interface SetupBenchmark {
  elapsedMs: number;
  threadCount: number;
  score: number;
  tier: 'low' | 'balanced' | 'high';
  confidence: number;
  source: string;
}

export interface SetupModelCandidate {
  id: WhisperModelSize;
  friendlyLabel: string;
  shortLabel: string;
  description: string;
  technicalDetail: string;
  expectedFileName: string;
  downloadUrl: string;
  estimatedSizeMb: number;
  installed: boolean;
  recommended: boolean;
}

export interface SetupRecommendation {
  modelId: WhisperModelSize;
  friendlyLabel: string;
  reason: string;
  confidence: number;
  installed: boolean;
}

export interface FirstRunSetupBenchmarkResult {
  benchmark: SetupBenchmark;
  resources: SetupResourceStatus;
  models: SetupModelCandidate[];
  recommendation: SetupRecommendation;
}

export interface SetupDownloadProgress {
  modelId: WhisperModelSize;
  downloadedBytes: number;
  totalBytes?: number;
  progress: number;
  status: 'starting' | 'downloading' | 'complete' | 'cancelled';
}

export interface SetupDownloadResult {
  modelId: WhisperModelSize;
  filePath: string;
  bytes: number;
  alreadyInstalled: boolean;
}

export function runFirstRunSetupBenchmark(): Promise<FirstRunSetupBenchmarkResult> {
  return invoke<FirstRunSetupBenchmarkResult>('run_first_run_setup_benchmark');
}

export function downloadWhisperModel(modelId: WhisperModelSize): Promise<SetupDownloadResult> {
  return invoke<SetupDownloadResult>('download_whisper_model', { modelId });
}

export function cancelWhisperModelDownload(modelId: WhisperModelSize): Promise<boolean> {
  return invoke<boolean>('cancel_whisper_model_download', { modelId });
}

export function deleteWhisperModel(modelId: WhisperModelSize): Promise<boolean> {
  return invoke<boolean>('delete_whisper_model', { modelId });
}

export async function onSetupDownloadProgress(
  handler: (progress: SetupDownloadProgress) => void
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<SetupDownloadProgress>('prism-setup-download-progress', (event) => {
    handler(event.payload);
  });
}

export function getSubtitleGenerationAvailability(model?: string): Promise<SubtitleGenerationAvailability> {
  return invoke<SubtitleGenerationAvailability>('get_subtitle_generation_availability', {
    model: model ?? null,
  });
}

export function readSubtitleFile(path: string): Promise<string> {
  return invoke<string>('read_subtitle_file', { path });
}

export function discoverSubtitles(videoId: string, videoPath: string): Promise<DiscoverSubtitlesResult> {
  return invoke<DiscoverSubtitlesResult>('discover_subtitles', { videoId, videoPath });
}

export function extractEmbeddedSubtitle(
  videoId: string,
  videoPath: string,
  trackIndex: number,
  outputFormat: string
): Promise<SubtitleTrack> {
  return invoke<SubtitleTrack>('extract_embedded_subtitle', {
    videoId,
    videoPath,
    trackIndex,
    outputFormat
  });
}

export function generateSubtitles(args: {
  videoId: string;
  videoPath: string;
  targetLanguage: string;
  sourceLanguage?: string;
  outputFormat: string;
  model: string;
  regenerate?: boolean;
  markForeignSpeech?: boolean;
  generationMode?: 'auto' | 'translate_existing' | 'from_audio';
  preferExternalSubtitles?: boolean;
  showSoundLabels?: boolean;
  nameStyle?: 'romanized' | 'localized_ru';
  audioStreamIndex?: number | null;
}): Promise<void> {
  return invoke<void>('generate_subtitles', {
    videoId: args.videoId,
    videoPath: args.videoPath,
    targetLanguage: args.targetLanguage,
    sourceLanguage: args.sourceLanguage ?? 'auto',
    outputFormat: args.outputFormat,
    model: args.model,
    regenerate: args.regenerate ?? null,
    markForeignSpeech: args.markForeignSpeech ?? null,
    generationMode: args.generationMode ?? null,
    preferExternalSubtitles: args.preferExternalSubtitles ?? null,
    showSoundLabels: args.showSoundLabels ?? null,
    nameStyle: args.nameStyle ?? null,
    audioStreamIndex: args.audioStreamIndex ?? null,
  });
}

export function probeVideoAudioStreams(videoPath: string): Promise<VideoAudioStream[]> {
  return invoke<VideoAudioStream[]>('probe_video_audio_streams', { videoPath });
}

export function importSubtitleForVideo(
  videoId: string,
  videoPath: string,
  subtitlePath: string
): Promise<DiscoverSubtitlesResult> {
  return invoke<DiscoverSubtitlesResult>('import_subtitle_for_video', {
    videoId,
    videoPath,
    subtitlePath,
  });
}

export async function pickSubtitleFile(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: 'Subtitles',
        extensions: ['ass', 'ssa', 'srt', 'vtt', 'sub'],
      },
    ],
  });
  if (!selected || Array.isArray(selected)) return null;
  return selected;
}

export function cancelSubtitleGeneration(videoId: string): Promise<void> {
  return invoke<void>('cancel_subtitle_generation', { videoId });
}

export function clearGeneratedSubtitleCache(videoPath?: string): Promise<void> {
  return invoke<void>('clear_generated_subtitle_cache', { videoPath: videoPath ?? null });
}

export function translateSubtitles(
  request: import('../../shared/subtitleTypes').TranslateSubtitlesRequest
): Promise<import('../../shared/subtitleTypes').TranslateSubtitlesResponse> {
  return invoke('translate_subtitles_command', { request });
}

export function translateExistingSubtitles(
  request: import('../../shared/subtitleTypes').TranslateExistingSubtitlesRequest
): Promise<void> {
  return invoke<void>('translate_existing_subtitles', { request });
}

export function getOrInferCharacterColor(
  request: import('../../shared/subtitleTypes').GetCharacterColorRequest
): Promise<import('../../shared/subtitleTypes').GetCharacterColorResponse> {
  return invoke('get_or_infer_character_color', { request });
}

export function setCharacterColorOverride(args: {
  franchiseKey?: string;
  videoKey?: string;
  characterName: string;
  color: string;
  outlineColor: string;
}): Promise<{ color: string; outlineColor: string; source: string; confidence: string }> {
  return invoke('set_character_color_override', { request: args });
}

export function resetCharacterColorOverride(args: {
  franchiseKey?: string;
  videoKey?: string;
  characterName: string;
}): Promise<void> {
  return invoke('reset_character_color_override', { request: args });
}

export function refreshSubtitleIndexForVideo(
  videoId: string,
  videoPath: string
): Promise<DiscoverSubtitlesResult> {
  return invoke<DiscoverSubtitlesResult>('refresh_subtitle_index_for_video', { videoId, videoPath });
}

import type {
  SubtitleGenerationDiagnostics,
  VideoAudioStream,
} from '../../shared/subtitleTypes';

export interface SubtitleGenerationEvent {
  videoId: string;
  progress?: number;
  message?: string;
  path?: string;
  error?: string;
  diagnostics?: SubtitleGenerationDiagnostics;
  status?: string;
  generatedUntilSeconds?: number;
  generatedCueCount?: number;
  validCueCount?: number;
  coverageRatio?: number;
  currentSegmentStart?: number;
  currentSegmentEnd?: number;
  backend?: string;
  model?: string;
  targetLanguage?: string;
  coverageRanges?: Array<{ start: number; end: number; status: 'ready' | 'generating' | 'failed' }>;
  contiguousFromStart?: boolean;
  rangeCount?: number;
}

export async function onSubtitleGenerationStarted(
  handler: (payload: SubtitleGenerationEvent) => void
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<SubtitleGenerationEvent>('subtitle-generation-started', (e) => handler(e.payload));
}

export async function onSubtitleGenerationProgress(
  handler: (payload: SubtitleGenerationEvent) => void
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<SubtitleGenerationEvent>('subtitle-generation-progress', (e) => handler(e.payload));
}

export async function onSubtitleGenerationCompleted(
  handler: (payload: SubtitleGenerationEvent) => void
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<SubtitleGenerationEvent>('subtitle-generation-completed', (e) => handler(e.payload));
}

export async function onSubtitleGenerationFailed(
  handler: (payload: SubtitleGenerationEvent) => void
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<SubtitleGenerationEvent>('subtitle-generation-failed', (e) => handler(e.payload));
}

export async function onSubtitleGenerationCancelled(
  handler: (payload: SubtitleGenerationEvent) => void
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<SubtitleGenerationEvent>('subtitle-generation-cancelled', (e) => handler(e.payload));
}

export async function onSubtitleGenerationPartial(
  handler: (payload: SubtitleGenerationEvent) => void
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<SubtitleGenerationEvent>('subtitle-generation-partial', (e) => handler(e.payload));
}

export function readTitleMetadata(cacheKey: string): Promise<TitleMetadataRecord | null> {
  return invoke<TitleMetadataRecord | null>('read_title_metadata', { cacheKey });
}

export function writeTitleMetadata(record: TitleMetadataRecord): Promise<void> {
  return invoke<void>('write_title_metadata', { record });
}

export function deleteTitleMetadata(cacheKey: string): Promise<void> {
  return invoke<void>('delete_title_metadata', { cacheKey });
}

export function cacheMetadataImage(
  remoteUrl: string,
  kind: 'poster' | 'backdrop' | 'banner' | 'screenshot' | 'trailer'
): Promise<TitleMetadataImageResult> {
  return invoke<TitleMetadataImageResult>('cache_metadata_image', { remoteUrl, kind });
}

export function getThumbnailTauri(
  mediaId: string,
  filePath: string,
  fileName?: string,
  priority?: number
): Promise<ThumbnailApiRecord> {
  return invoke<ThumbnailApiRecord>('get_thumbnail', {
    mediaId,
    filePath,
    fileName,
    priority,
  });
}

export function retryThumbnailTauri(
  mediaId: string,
  filePath: string,
  fileName?: string
): Promise<ThumbnailApiRecord> {
  return invoke<ThumbnailApiRecord>('retry_thumbnail', { mediaId, filePath, fileName });
}

export function readIdentityCache(
  mediaId: string,
  mtimeMs: number,
  parserVersion: number
): Promise<ParsedMediaIdentity | null> {
  return invoke<ParsedMediaIdentity | null>('read_identity_cache', {
    mediaId,
    mtimeMs,
    parserVersion,
  });
}

export function writeIdentityCache(
  mediaId: string,
  mtimeMs: number,
  parserVersion: number,
  parsed: ParsedMediaIdentity
): Promise<void> {
  return invoke<void>('write_identity_cache', {
    mediaId,
    mtimeMs,
    parserVersion,
    parsed,
  });
}
