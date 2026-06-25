import type { SubtitleTrack } from '../../../shared/subtitleTypes';
import { readSubtitleFile } from '../../lib/tauriCommands';
import { findActiveCue } from './subtitleDebug';
import { isValidGeneratedTrack, validateGeneratedSubtitles } from './subtitleCueQuality';
import { getActiveSubtitleCues, parseSubtitleCuesForTrack } from './subtitleTextTrack';
import { sanitizeCueTextForDisplay } from './subtitleSanitize';

function languageMatches(trackLang: string, target: string): boolean {
  if (trackLang === target) return true;
  return trackLang.split('-')[0] === target.split('-')[0];
}

export function mergeGeneratedTracksForLanguage(
  tracks: SubtitleTrack[],
  targetLanguage: string
): SubtitleTrack[] {
  const hasValidTarget = tracks.some(
    (tr) => tr.source === 'generated'
      && languageMatches(tr.language, targetLanguage)
      && isValidGeneratedTrack(tr)
  );
  if (!hasValidTarget) return tracks;
  return tracks.filter((tr) => {
    if (tr.source !== 'generated') return true;
    if (!languageMatches(tr.language, targetLanguage)) return true;
    return isValidGeneratedTrack(tr);
  });
}

export async function logGenerationResult(args: {
  videoPath: string;
  videoKey: string;
  targetLanguage: string;
  outputPath?: string;
  tracks: SubtitleTrack[];
  selectedTrackId: string | null;
  video: HTMLVideoElement | null;
}): Promise<void> {
  const track = args.tracks.find(
    (tr) => tr.source === 'generated'
      && languageMatches(tr.language, args.targetLanguage)
      && isValidGeneratedTrack(tr)
  ) ?? args.tracks.find((tr) => tr.path === args.outputPath);

  const outputPath = track?.path ?? args.outputPath ?? null;
  let outputExists = false;
  let outputSize = 0;
  let raw = '';
  let parsedCueCount = 0;
  let first5Cues: Array<{ start: number; end: number; text: string }> = [];
  let firstCueColor: string | null = null;

  if (outputPath) {
    try {
      raw = await readSubtitleFile(outputPath);
      outputExists = raw.trim().length > 0;
      outputSize = raw.length;
      if (track && outputExists) {
        const parsed = parseSubtitleCuesForTrack(track, raw);
        parsedCueCount = parsed.cues.length;
        first5Cues = parsed.cues.slice(0, 5).map((c) => ({
          start: c.start,
          end: c.end,
          text: c.text,
        }));
        firstCueColor = parsed.cues[0]?.color ?? null;
      }
    } catch (error) {
      console.warn('[Virelia subtitles] generation result read failed', outputPath, error);
    }
  }

  const videoDuration = args.video && Number.isFinite(args.video.duration) && args.video.duration > 0
    ? args.video.duration
    : undefined;
  const validation = track && raw
    ? validateGeneratedSubtitles(
      parseSubtitleCuesForTrack(track, raw).cues,
      { videoDuration, rawLength: outputSize }
    )
    : null;

  const activeCues = getActiveSubtitleCues();
  const activeCueAtCurrentTime = args.video
    ? findActiveCue(activeCues, args.video.currentTime, { hideNonSpeech: true })
    : null;
  const displayText = activeCueAtCurrentTime
    ? sanitizeCueTextForDisplay(activeCueAtCurrentTime.text)
    : '';

  const trackAddedToStore = Boolean(
    track && args.tracks.some((tr) => tr.id === track.id)
  );

  console.info('[Virelia subtitles] generation result:', {
    videoPath: args.videoPath,
    videoKey: args.videoKey,
    targetLanguage: args.targetLanguage,
    outputPath,
    outputExists,
    outputSize,
    metadataPath: track
      ? outputPath?.replace(/\.(vtt|ass|srt)$/i, '.meta.json')
      : null,
    metadata: track
      ? {
          targetLanguage: track.language,
          videoKey: track.videoKey,
          generationValid: track.generationValid,
          invalidReason: track.generationInvalidReason,
          pipelineVersion: track.generationPipelineVersion,
        }
      : null,
    first5Cues,
    trackId: track?.id ?? null,
    trackAddedToStore,
    selectedTrackId: args.selectedTrackId,
    selectedTrackVideoKey: args.tracks.find((tr) => tr.id === args.selectedTrackId)?.videoKey ?? null,
    parsedCueCount,
    activeCueAtCurrentTime: activeCueAtCurrentTime
      ? {
          start: activeCueAtCurrentTime.start,
          end: activeCueAtCurrentTime.end,
          text: activeCueAtCurrentTime.text,
        }
      : null,
    displayText,
    colorMapUsed: Boolean(track?.generationValid),
    firstCueColor,
    videoDuration: videoDuration ?? null,
    cueCount: validation?.totalCueCount ?? parsedCueCount,
    speechCueCount: validation?.speechCueCount ?? null,
    totalCueDuration: validation?.coverageStats?.totalCueDuration ?? null,
    coverageRatio: validation?.coverageStats?.coverageRatio ?? null,
    lastCueEnd: validation?.coverageStats?.lastCueEnd ?? null,
    longestGap: validation?.coverageStats?.longestGap ?? null,
    validationStatus: validation?.valid === false || track?.generationValid === false
      ? 'invalid'
      : validation?.valid
        ? 'valid'
        : null,
    invalidReason: validation?.reason ?? track?.generationInvalidReason ?? null,
  });
}
