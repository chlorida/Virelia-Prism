import type { MediaItem } from '../../../shared/types';
import type { UiLanguagePreference } from '../../../shared/types';
import type { UiLocale } from '../../../shared/i18n';
import { resolveEffectiveMediaLanguage } from './languageResolution';
import {
  buildMediaDisplayIdentity,
  getDisplayTitleForItem,
  getParsedIdentity,
  getTechnicalChipsFromParsed,
} from './mediaIdentityService';
import type { MediaDisplayIdentity, ParsedMediaIdentity, SmartUpNextPlan } from './types';
import { buildSmartUpNextPlan } from './smartUpNextService';
import { isPlayableLocalMediaItem } from './playableMediaFilter';

export function resolveMetadataLanguage(
  uiLanguage: UiLanguagePreference,
  metadataLanguage?: UiLanguagePreference,
  uiLocale?: UiLocale
): 'en' | 'ru' {
  return resolveEffectiveMediaLanguage({ uiLanguage, metadataLanguage, uiLocale });
}

export function getMediaIdentity(item: MediaItem, language?: string): ParsedMediaIdentity {
  return getParsedIdentity(item, language);
}

export function getMediaDisplay(item: MediaItem, language?: string): MediaDisplayIdentity {
  return buildMediaDisplayIdentity(item, language);
}

export function getDisplayTitle(item: MediaItem, language?: string): string {
  return getDisplayTitleForItem(item, language);
}

export function getShortTitle(item: MediaItem, language?: string, max = 56): string {
  const title = getDisplayTitle(item, language);
  if (title.length <= max) return title;
  return `${title.slice(0, max - 1).trim()}…`;
}

export function getTechnicalChips(identity: ParsedMediaIdentity): string[] {
  return getTechnicalChipsFromParsed(identity);
}

export function buildWatchUpNext(
  current: MediaItem | undefined,
  catalogItems: MediaItem[],
  historyItems: MediaItem[],
  uiLanguage: UiLanguagePreference = 'auto',
  metadataLanguage?: UiLanguagePreference,
  uiLocale?: UiLocale
): SmartUpNextPlan {
  const lang = resolveMetadataLanguage(uiLanguage, metadataLanguage, uiLocale);
  const playableCatalog = catalogItems.filter((i) => isPlayableLocalMediaItem(i));
  const playableHistory = historyItems.filter((i) => isPlayableLocalMediaItem(i));
  return buildSmartUpNextPlan(current, playableCatalog, playableHistory, lang);
}

export { isPlayableLocalMediaItem, isRecommendableLocalItem, filterPlayableLocalRecommendations } from './playableMediaFilter';

export { parseMediaIdentity } from './episodeParser';
export { buildSmartUpNextPlan } from './smartUpNextService';
