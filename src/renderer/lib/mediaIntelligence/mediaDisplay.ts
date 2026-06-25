import type { MediaItem } from '../../../shared/types';
import { formatPathForDisplay } from '../pathDisplay';
import type { MediaDisplayLanguage } from './languageResolution';
import { resolveEffectiveMediaLanguage } from './languageResolution';
import {
  buildMediaDisplayIdentity,
  getDisplayTitleForItem,
  getTechnicalChipsFromParsed,
} from './mediaIdentityService';
import { getShortTitle } from './mediaIntelligenceService';
import type { DisplayTitleSource } from './types';

export interface MediaDisplayContext {
  language?: MediaDisplayLanguage | string;
  uiLanguage?: string;
  metadataLanguage?: string;
  uiLocale?: string;
}

export interface MediaDisplay {
  title: string;
  subtitle?: string;
  episodeLabel?: string;
  seriesTitle?: string;
  chips: string[];
  pathDisplay: string;
  language: MediaDisplayLanguage;
  source: DisplayTitleSource;
  /** Compact label for bottom strip / watch header rail */
  shortTitle: string;
}

export function resolveMediaLanguage(
  item: MediaItem | null | undefined,
  context?: MediaDisplayContext
): MediaDisplayLanguage {
  if (context?.language === 'en' || context?.language === 'ru') return context.language;
  return resolveEffectiveMediaLanguage({
    uiLanguage: (context?.uiLanguage as 'auto' | 'en' | 'ru') ?? 'auto',
    metadataLanguage: context?.metadataLanguage as 'auto' | 'en' | 'ru' | undefined,
    uiLocale: context?.uiLocale === 'ru' ? 'ru' : 'en',
  });
}

/** Single canonical display resolver for all UI surfaces. */
export function resolveMediaDisplay(
  item: MediaItem | null | undefined,
  context?: MediaDisplayContext
): MediaDisplay {
  if (!item) {
    return {
      title: '',
      chips: [],
      pathDisplay: '',
      language: 'en',
      source: 'parser',
      shortTitle: '',
    };
  }

  const language = resolveMediaLanguage(item, context);
  const identity = buildMediaDisplayIdentity(item, language);
  const parsed = identity.parsed;
  const shortTitle = getShortTitle(item, language);
  const subtitle = parsed.probableSeriesTitle !== identity.title
    ? parsed.probableSeriesTitle
    : item.artist ?? item.fileName;

  return {
    title: identity.title,
    subtitle,
    episodeLabel: identity.episodeLabel,
    seriesTitle: parsed.probableSeriesTitle,
    chips: getTechnicalChipsFromParsed(parsed),
    pathDisplay: formatPathForDisplay(item.filePath || item.folder),
    language,
    source: identity.source,
    shortTitle,
  };
}

export function resolveMediaDisplayTitle(
  item: MediaItem | null | undefined,
  context?: MediaDisplayContext
): string {
  if (!item) return '';
  const language = resolveMediaLanguage(item, context);
  return getDisplayTitleForItem(item, language);
}
