import type {
  SourceAudioLanguage,
  SubtitlePreferredLanguage,
  SubtitleSource,
  SubtitleTrack,
  TargetSubtitleLanguage,
} from '../../../shared/subtitleTypes';
import type { AppSettings } from '../../../shared/types';
import type { TranslationKey, UiLocale } from '../../../shared/i18n';
import { isValidGeneratedTrack } from './subtitleCueQuality';

const SOURCE_PRIORITY: SubtitleSource[] = ['external', 'generated', 'embedded'];

function languageMatches(track: SubtitleTrack, language: string | undefined): boolean {
  if (!language) return false;
  return track.language === language;
}

export function pickAutoSubtitleTrack(
  tracks: SubtitleTrack[],
  preferred: SubtitlePreferredLanguage,
  targetLanguage?: TargetSubtitleLanguage
): SubtitleTrack | null {
  if (tracks.length === 0) return null;

  const eligible = tracks.filter((t) => isValidGeneratedTrack(t));
  if (eligible.length === 0) return null;

  const language =
    preferred !== 'auto'
      ? preferred
      : targetLanguage;

  for (const source of SOURCE_PRIORITY) {
    const pool = eligible.filter((t) => t.source === source);
    if (pool.length === 0) continue;

    if (language) {
      const langMatch = pool.find((t) => languageMatches(t, language));
      if (langMatch) return langMatch;
    }

    const defaultTrack = pool.find((t) => t.isDefault);
    if (defaultTrack) return defaultTrack;

    return pool[0] ?? null;
  }

  return null;
}

export function resolvePreferredLanguage(settings?: AppSettings): SubtitlePreferredLanguage {
  const lang = settings?.subtitles.preferredLanguage
    ?? settings?.subtitles.defaultLanguage
    ?? 'auto';
  if (lang === 'auto' || lang === 'en' || lang === 'ru' || lang === 'ja'
    || lang === 'de' || lang === 'fr' || lang === 'es' || lang === 'ko' || lang === 'zh') {
    return lang;
  }
  return 'auto';
}

export function defaultTargetSubtitleLanguage(
  locale: UiLocale,
  settings?: AppSettings
): TargetSubtitleLanguage {
  const preferred = resolvePreferredLanguage(settings);
  if (preferred !== 'auto') return preferred;
  return locale === 'ru' ? 'ru' : 'en';
}

export function formatSubtitleMenuLabel(
  track: SubtitleTrack,
  t?: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  if (track.source === 'generated' && track.recoveredFromFailure && track.isPartial && t) {
    return t('subtitles.recoveredPartialTrack', { language: track.languageLabel });
  }
  if (track.source === 'generated' && track.isLiveUpdating && track.isPartial && t) {
    return t('subtitles.liveGeneratingTrack', { language: track.languageLabel });
  }
  if (track.source === 'generated' && track.isPartial && t) {
    return t('subtitles.partialTrack', { language: track.languageLabel });
  }
  if (track.source === 'generated' && t) {
    return t('subtitles.generatedTrackLabel', { language: track.languageLabel });
  }
  if (track.label) return track.label;
  if (track.source === 'generated') {
    return `Generated — ${track.languageLabel}`;
  }
  if (track.source === 'embedded') {
    return `Embedded ${track.languageLabel}`;
  }
  if (track.language === 'und') {
    return `Unknown language — ${track.format}`;
  }
  return `${track.languageLabel} — ${track.format}`;
}

/** @deprecated Use defaultTargetSubtitleLanguage */
export function resolveGenerationLanguage(
  generationLanguage: SubtitlePreferredLanguage,
  settings?: AppSettings
): string {
  if (generationLanguage !== 'auto') return generationLanguage;
  const preferred = resolvePreferredLanguage(settings);
  return preferred === 'auto' ? 'en' : preferred;
}

export function resolveTargetSubtitleLanguage(
  target: TargetSubtitleLanguage,
  _settings?: AppSettings
): TargetSubtitleLanguage {
  return target;
}

export function resolveSourceAudioLanguage(source: SourceAudioLanguage): string {
  return source === 'auto' ? 'auto' : source;
}
