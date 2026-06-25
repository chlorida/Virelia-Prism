import { cueTextContainsTimestampMarkup, looksLikeRawSubtitleFile } from './subtitleSanitize';
import type { ParsedCue } from './vttParser';

const NON_SPEECH_LABELS = new Set([
  'music',
  'bgm',
  'song',
  'singing',
  'moaning',
  'groaning',
  'sigh',
  'sighs',
  'laughs',
  'laughing',
  'crying',
  'applause',
  'clapping',
  'noise',
  'sound',
  'silence',
  'background music',
  'laughter',
  'instrumental',
  'музыка',
  'песня',
  'стон',
  'стонет',
  'вздох',
  'смех',
  'плач',
  'аплодисменты',
  'шум',
  'звук',
  'тишина',
  'chuckle',
  'chuckles',
  'giggle',
  'giggles',
]);

const HALLUCINATED_ACTION_RE = /\b(chuckles?|laughs?|laughing|giggles?|sighs?|coughs?|clears throat|applause|clapping|moaning|groaning)\b/i;

/** YouTube-style bracket garbage like [welonz chuckles] — not real anime subtitles. */
export function isHallucinatedBracketLabel(text: string): boolean {
  const trimmed = text.trim();
  const bracketMatch = trimmed.match(/^\[([^\]]+)\]$/);
  if (!bracketMatch) return false;

  const inner = bracketMatch[1].trim();
  const innerLower = inner.toLowerCase();

  const hasCjk = /[\u3040-\u30ff\u4e00-\u9fff]/.test(inner);
  if (hasCjk) return false;

  if (/^[a-z0-9][a-z0-9 _-]*\s+[a-z]/.test(innerLower) && HALLUCINATED_ACTION_RE.test(innerLower)) {
    return true;
  }

  if (HALLUCINATED_ACTION_RE.test(innerLower) && innerLower.split(/\s+/).length <= 4) {
    return true;
  }

  return false;
}

export function countHallucinatedBracketLabels(cues: ParsedCue[]): number {
  return cues.filter((cue) => isHallucinatedBracketLabel(cue.text)).length;
}

export interface RepetitionStats {
  mostRepeatedText: string;
  repeatCount: number;
  consecutiveRepeatMax: number;
  repeatedTextRatio: number;
}

export interface SubtitleValidationStats {
  cueCount: number;
  speechCueCount: number;
  nonSpeechCueCount: number;
  videoDuration: number;
  totalCueDuration: number;
  coverageRatio: number;
  firstCueStart?: number;
  lastCueEnd?: number;
  longestGap?: number;
  repeatedTextRatio: number;
  invalid: boolean;
  invalidReason?: string;
}

export interface GeneratedSubtitleValidation {
  valid: boolean;
  reason?: string;
  message?: string;
  speechCueCount: number;
  nonSpeechCueCount: number;
  totalCueCount: number;
  repetitionStats?: RepetitionStats;
  coverageStats?: SubtitleValidationStats;
}

function normalizeCueText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeForRepetition(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripCueBrackets(normalized: string): string {
  return normalized
    .replace(/^[\[(]+\s*/, '')
    .replace(/\s*[\])]+$/, '')
    .trim();
}

export function isNonSpeechCue(text: string): boolean {
  if (isHallucinatedBracketLabel(text)) return true;

  const normalized = normalizeCueText(text);
  if (!normalized) return true;

  const bracketless = stripCueBrackets(normalized);
  if (NON_SPEECH_LABELS.has(bracketless)) return true;

  if (/^[♪♫♬♩\s]+$/.test(normalized)) return true;

  if (normalized.length <= 24 && (normalized.startsWith('[') || normalized.startsWith('('))) {
    if (bracketless.length <= 20 && [...NON_SPEECH_LABELS].some((tag) => bracketless.includes(tag))) {
      return true;
    }
  }

  return false;
}

export function isSpeechCue(text: string): boolean {
  return !isNonSpeechCue(text);
}

export function computeCoverageStats(
  cues: ParsedCue[],
  videoDuration: number
): Omit<SubtitleValidationStats, 'cueCount' | 'speechCueCount' | 'nonSpeechCueCount' | 'repeatedTextRatio' | 'invalid' | 'invalidReason'> {
  let totalCueDuration = 0;
  let firstCueStart: number | undefined;
  let lastCueEnd: number | undefined;
  let longestGap: number | undefined;
  let prevEnd: number | undefined;

  for (const cue of cues) {
    if (isNonSpeechCue(cue.text)) continue;
    const dur = Math.max(0, cue.end - cue.start);
    totalCueDuration += dur;
    firstCueStart = firstCueStart == null ? cue.start : Math.min(firstCueStart, cue.start);
    lastCueEnd = lastCueEnd == null ? cue.end : Math.max(lastCueEnd, cue.end);
    if (prevEnd != null) {
      const gap = Math.max(0, cue.start - prevEnd);
      longestGap = longestGap == null ? gap : Math.max(longestGap, gap);
    }
    prevEnd = cue.end;
  }

  const coverageRatio = videoDuration > 0 ? totalCueDuration / videoDuration : 0;
  return {
    videoDuration,
    totalCueDuration,
    coverageRatio,
    firstCueStart,
    lastCueEnd,
    longestGap,
  };
}

export function validateGeneratedCoverage(
  cues: ParsedCue[],
  stats: Pick<SubtitleValidationStats, 'cueCount' | 'speechCueCount'>,
  videoDuration?: number,
  rawLength?: number
): string | null {
  const duration = videoDuration ?? 0;

  if (duration <= 0) {
    if (stats.cueCount <= 1) return 'too-few-cues';
    return null;
  }

  if (duration > 60 && stats.cueCount <= 1) return 'too-few-cues';

  if (rawLength != null && duration > 300 && rawLength < 500) return 'output-too-small';

  if (duration > 300) {
    if (stats.cueCount < 5) return 'too-few-cues';
    if (stats.speechCueCount < 5) return 'too-few-cues';
  }

  if (duration > 1200 && stats.cueCount < 20) return 'too-few-cues';

  if (duration <= 60) return null;

  const coverage = computeCoverageStats(cues, duration);
  if (coverage.coverageRatio < 0.05) return 'low-coverage';

  if (duration > 300 && coverage.lastCueEnd != null && coverage.lastCueEnd < 60 && stats.cueCount <= 3) {
    return 'low-coverage';
  }

  return null;
}

export function filterDisplayCues(
  cues: ParsedCue[],
  showSoundLabels = false
): ParsedCue[] {
  return cues.filter((cue) => {
    if (cueTextContainsTimestampMarkup(cue.text) || looksLikeRawSubtitleFile(cue.text)) {
      return false;
    }
    if (isHallucinatedBracketLabel(cue.text)) return false;
    if (!showSoundLabels && isNonSpeechCue(cue.text)) return false;
    return true;
  });
}

export function detectRepeatedHallucinations(cues: ParsedCue[]): RepetitionStats & { invalid: boolean } {
  const speechTexts = cues
    .filter((cue) => isSpeechCue(cue.text) && !cueTextContainsTimestampMarkup(cue.text))
    .map((cue) => normalizeForRepetition(cue.text))
    .filter(Boolean);

  const counts = new Map<string, number>();
  for (const text of speechTexts) {
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }

  let mostRepeatedText = '';
  let repeatCount = 0;
  for (const [text, count] of counts) {
    if (count > repeatCount) {
      mostRepeatedText = text;
      repeatCount = count;
    }
  }

  let consecutiveRepeatMax = 0;
  let streak = 0;
  let prev = '';
  for (const text of speechTexts) {
    if (text && text === prev) {
      streak += 1;
      consecutiveRepeatMax = Math.max(consecutiveRepeatMax, streak);
    } else {
      streak = 1;
      prev = text;
    }
  }

  const repeatedTextRatio = speechTexts.length > 0 ? repeatCount / speechTexts.length : 0;
  const invalid = repeatCount >= 8
    || consecutiveRepeatMax >= 4
    || (speechTexts.length >= 8 && repeatedTextRatio > 0.55);

  return {
    mostRepeatedText,
    repeatCount,
    consecutiveRepeatMax,
    repeatedTextRatio,
    invalid,
  };
}

export function buildSubtitleValidationStats(
  cues: ParsedCue[],
  options?: { videoDuration?: number; rawLength?: number }
): SubtitleValidationStats {
  const speechCueCount = cues.filter((cue) => isSpeechCue(cue.text)).length;
  const nonSpeechCueCount = cues.length - speechCueCount;
  const repetitionStats = detectRepeatedHallucinations(cues);
  const videoDuration = options?.videoDuration ?? 0;
  const coverage = computeCoverageStats(cues, videoDuration);
  const coverageReason = validateGeneratedCoverage(
    cues,
    { cueCount: cues.length, speechCueCount },
    options?.videoDuration,
    options?.rawLength
  );

  return {
    cueCount: cues.length,
    speechCueCount,
    nonSpeechCueCount,
    videoDuration,
    totalCueDuration: coverage.totalCueDuration,
    coverageRatio: coverage.coverageRatio,
    firstCueStart: coverage.firstCueStart,
    lastCueEnd: coverage.lastCueEnd,
    longestGap: coverage.longestGap,
    repeatedTextRatio: repetitionStats.repeatedTextRatio,
    invalid: Boolean(coverageReason) || repetitionStats.invalid,
    invalidReason: coverageReason ?? (repetitionStats.invalid ? 'repeated_hallucinated_text' : undefined),
  };
}

/** Lightweight validation for live/recovered partial tracks during generation. */
export function validatePartialPlaybackCues(cues: ParsedCue[]): GeneratedSubtitleValidation {
  const totalCueCount = cues.length;
  if (totalCueCount === 0) {
    return {
      valid: false,
      reason: 'generated_no_speech',
      message: 'No subtitle cues',
      speechCueCount: 0,
      nonSpeechCueCount: 0,
      totalCueCount: 0,
    };
  }

  const rawTimestampCues = cues.filter(
    (cue) => cueTextContainsTimestampMarkup(cue.text) || looksLikeRawSubtitleFile(cue.text)
  );
  if (rawTimestampCues.length > 0) {
    return {
      valid: false,
      reason: 'generated_raw_vtt_in_cues',
      message: 'Generated subtitles contain unparsed VTT timestamps',
      speechCueCount: 0,
      nonSpeechCueCount: totalCueCount,
      totalCueCount,
    };
  }

  const speechCueCount = cues.filter((cue) => isSpeechCue(cue.text)).length;
  const nonSpeechCueCount = totalCueCount - speechCueCount;
  const displayableCount = cues.filter((cue) => cue.text.trim().length > 0).length;

  if (displayableCount === 0 || speechCueCount === 0) {
    return {
      valid: false,
      reason: 'generated_no_speech',
      message: 'No displayable subtitle cues',
      speechCueCount,
      nonSpeechCueCount,
      totalCueCount,
    };
  }

  return {
    valid: true,
    speechCueCount,
    nonSpeechCueCount,
    totalCueCount,
  };
}

export function validateGeneratedSubtitles(
  cues: ParsedCue[],
  options?: { videoDuration?: number; rawLength?: number }
): GeneratedSubtitleValidation {
  const totalCueCount = cues.length;
  if (totalCueCount === 0) {
    return {
      valid: false,
      reason: 'generated_no_speech',
      message: 'No subtitle cues',
      speechCueCount: 0,
      nonSpeechCueCount: 0,
      totalCueCount: 0,
    };
  }

  const rawTimestampCues = cues.filter(
    (cue) => cueTextContainsTimestampMarkup(cue.text) || looksLikeRawSubtitleFile(cue.text)
  );
  if (rawTimestampCues.length > 0) {
    return {
      valid: false,
      reason: 'generated_raw_vtt_in_cues',
      message: 'Generated subtitles contain unparsed VTT timestamps',
      speechCueCount: 0,
      nonSpeechCueCount: totalCueCount,
      totalCueCount,
    };
  }

  const hallucinatedCount = countHallucinatedBracketLabels(cues);
  const speechCueCount = cues.filter((cue) => isSpeechCue(cue.text)).length;
  const nonSpeechCueCount = totalCueCount - speechCueCount;

  if (speechCueCount === 0) {
    return {
      valid: false,
      reason: hallucinatedCount > 0 ? 'hallucinated_sound_labels' : 'generated_no_speech',
      message: hallucinatedCount > 0
        ? 'Generated subtitles contain hallucinated sound labels'
        : 'This generated subtitle file contains no speech cues',
      speechCueCount,
      nonSpeechCueCount,
      totalCueCount,
    };
  }

  if (hallucinatedCount >= 3 && hallucinatedCount / totalCueCount > 0.35) {
    return {
      valid: false,
      reason: 'hallucinated_sound_labels',
      message: 'Generated subtitles contain too many hallucinated sound labels',
      speechCueCount,
      nonSpeechCueCount,
      totalCueCount,
    };
  }

  const repetitionStats = detectRepeatedHallucinations(cues);
  const coverageStats = buildSubtitleValidationStats(cues, options);

  if (coverageStats.invalid && coverageStats.invalidReason) {
    return {
      valid: false,
      reason: coverageStats.invalidReason,
      message: coverageStats.invalidReason,
      speechCueCount,
      nonSpeechCueCount,
      totalCueCount,
      repetitionStats,
      coverageStats,
    };
  }

  if (repetitionStats.invalid) {
    return {
      valid: false,
      reason: 'repeated_hallucinated_text',
      message: 'Generated subtitles contain repeated hallucinated text',
      speechCueCount,
      nonSpeechCueCount,
      totalCueCount,
      repetitionStats,
      coverageStats,
    };
  }

  const nonSpeechRatio = nonSpeechCueCount / totalCueCount;
  if (nonSpeechRatio > 0.5 || (speechCueCount === 1 && totalCueCount >= 3)) {
    return {
      valid: false,
      reason: 'generated_mostly_non_speech',
      message: 'Generated subtitles contain mostly sound labels',
      speechCueCount,
      nonSpeechCueCount,
      totalCueCount,
      repetitionStats,
      coverageStats,
    };
  }

  if (totalCueCount >= 10 && speechCueCount < 3 && speechCueCount / totalCueCount < 0.2) {
    return {
      valid: false,
      reason: 'generated_no_speech',
      message: 'Generated subtitles contain too little speech',
      speechCueCount,
      nonSpeechCueCount,
      totalCueCount,
      repetitionStats,
      coverageStats,
    };
  }

  return {
    valid: true,
    speechCueCount,
    nonSpeechCueCount,
    totalCueCount,
    repetitionStats,
    coverageStats,
  };
}
