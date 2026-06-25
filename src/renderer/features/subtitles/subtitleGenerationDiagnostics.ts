import type { SourceAudioLanguage, SubtitleGenerationDiagnostics } from '../../../shared/subtitleTypes';

function formatDuration(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return 'unknown';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPercent(ratio?: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return 'unknown';
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatBytes(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatGenerationDiagnostics(d: SubtitleGenerationDiagnostics): string {
  return [
    `video duration: ${formatDuration(d.videoDurationSec)}`,
    `generated cues: ${d.generatedCueCount ?? 'unknown'}`,
    `coverage: ${formatPercent(d.coverageRatio)}`,
    `selected audio stream: ${d.selectedAudioStream ?? 'unknown'}`,
    `audio language: ${d.audioLanguage ?? 'unknown'}`,
    `audio duration: ${formatDuration(d.audioDurationSec)}`,
    `extracted audio size: ${formatBytes(d.extractedAudioBytes)}`,
    `transcription backend: ${d.transcriptionBackend}`,
    `model name: ${d.modelName}`,
    `source language mode: ${d.sourceLanguageMode}`,
    `target language: ${d.targetLanguage}`,
    `reason: ${d.message || d.reason}`,
  ].join('\n');
}

export function isAnimeMediaPath(videoPath?: string | null): boolean {
  if (!videoPath) return false;
  const lower = videoPath.toLowerCase();
  return [
    'higurashi',
    'when they cry',
    'anime',
    'gou',
    'sotsu',
    'kai',
    'sonic x',
    'vcb-studio',
    'bdrip',
  ].some((marker) => lower.includes(marker));
}

export interface SourceLanguageHintContext {
  country?: string;
  originalLanguage?: string;
  isAnime?: boolean;
}

/** Resolve Whisper source language; anime + auto defaults to Japanese. */
export function resolveEffectiveSourceLanguage(
  source: SourceAudioLanguage,
  videoPath?: string | null,
  context?: SourceLanguageHintContext
): string {
  if (source !== 'auto') return source;
  if (context?.originalLanguage === 'ja' || context?.country === 'JP') return 'ja';
  if (context?.isAnime) return 'ja';
  if (isAnimeMediaPath(videoPath)) return 'ja';
  return 'auto';
}

export function isUsingJapaneseAnimeHint(
  source: SourceAudioLanguage,
  videoPath?: string | null,
  context?: SourceLanguageHintContext
): boolean {
  return source === 'auto' && resolveEffectiveSourceLanguage(source, videoPath, context) === 'ja';
}

export function whisperModelQualityHint(model: string, anime = false): string | null {
  if (model === 'tiny' || model === 'base') {
    return anime
      ? 'tiny/base models are often inaccurate for Japanese anime dialogue. Prefer small, medium, or large-v3.'
      : 'tiny/base models may miss dialogue on long videos. Prefer small or medium.';
  }
  if (model === 'small') {
    return anime ? 'For Japanese anime, medium or large-v3 is recommended.' : null;
  }
  return null;
}
