import type { MediaItem } from '../../../shared/types';

import type { LocalizedTitleMap, MediaManualOverride, ParsedMediaIdentity } from './types';

import { findSeriesAlias, normalizeAliasKey } from './aliasCache';

import { getCachedMetadata } from './metadata/metadataService';

import type { MediaMetadata } from './metadata/types';

import type { MediaDisplayLanguage } from './languageResolution';



export function resolveLanguage(pref?: string): MediaDisplayLanguage {

  if (pref === 'ru' || pref === 'en') return pref;

  return 'en';

}



function isCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

function pickLocalizedStrict(
  map: LocalizedTitleMap | undefined,
  lang: MediaDisplayLanguage,
  allowEnglishFallback: boolean
): string | undefined {
  if (!map) return undefined;

  const primary = map[lang];
  if (primary) {
    if (lang === 'en' && isCyrillic(primary)) {
      // Skip Russian/Cyrillic strings when English UI is active.
    } else {
      return primary;
    }
  }

  if (allowEnglishFallback && lang !== 'en' && map.en) return map.en;

  if (lang === 'en' && map.en) return map.en;

  if (map.romaji && lang === 'en') return map.romaji;

  return undefined;
}



function formatEpisodeSuffix(lang: MediaDisplayLanguage, episodeNumber: number): string {

  const ep = String(episodeNumber).padStart(2, '0');

  if (lang === 'ru') return ` — серия ${ep}`;
  return ` — Episode ${ep}`;

}



export function resolveLocalizedSeriesTitle(

  identity: ParsedMediaIdentity,

  lang: MediaDisplayLanguage,

  manual?: MediaManualOverride,

  providerMeta?: MediaMetadata

): { title: string; map: LocalizedTitleMap; source: 'manual' | 'provider' | 'alias-cache' | 'parser' } {

  if (manual?.titles) {

    const manualTitle = pickLocalizedStrict(manual.titles, lang, true);

    if (manualTitle) return { title: manualTitle, map: manual.titles, source: 'manual' };

  }



  if (providerMeta) {

    const fromProvider = pickLocalizedStrict(

      {

        en: providerMeta.title,

        ...providerMeta.localizedTitleByLanguage,

        ru: providerMeta.localizedTitleByLanguage?.ru ?? providerMeta.localizedTitle,

      },

      lang,

      true

    );

    if (fromProvider) {

      const map: LocalizedTitleMap = {

        ...identity.localizedTitles,

        ...providerMeta.localizedTitleByLanguage,

        en: providerMeta.title,

      };

      return { title: fromProvider, map, source: 'provider' };

    }

  }



  const alias = findSeriesAlias(normalizeAliasKey(identity.probableSeriesTitle ?? identity.cleanTitle));

  if (alias) {

    const fromAlias = pickLocalizedStrict(alias.titles, lang, true);

    if (fromAlias) {

      return { title: fromAlias, map: alias.titles, source: 'alias-cache' };

    }

  }



  if (identity.localizedTitles) {

    const fromCache = pickLocalizedStrict(identity.localizedTitles, lang, false);

    if (fromCache) return { title: fromCache, map: identity.localizedTitles, source: 'alias-cache' };

  }



  return {

    title: identity.probableSeriesTitle ?? identity.cleanTitle,

    map: identity.localizedTitles ?? {},

    source: 'parser',

  };

}



export function buildLocalizedDisplayTitle(

  identity: ParsedMediaIdentity,

  lang: MediaDisplayLanguage,

  item?: MediaItem,

  manual?: MediaManualOverride

): string {

  const providerMeta = item ? getCachedMetadata(item.id) : undefined;

  const { title: seriesTitle } = resolveLocalizedSeriesTitle(identity, lang, manual, providerMeta ?? undefined);



  if (identity.episodeNumber != null) {

    return `${seriesTitle}${formatEpisodeSuffix(lang, identity.episodeNumber)}`;

  }

  return seriesTitle;

}



export function applyLocalizedToIdentity(

  item: MediaItem,

  identity: ParsedMediaIdentity,

  language?: MediaDisplayLanguage,

  manual?: MediaManualOverride

): ParsedMediaIdentity {

  const lang = resolveLanguage(language);

  const providerMeta = getCachedMetadata(item.id);

  const { title, map, source } = resolveLocalizedSeriesTitle(identity, lang, manual, providerMeta);



  const out: ParsedMediaIdentity = {

    ...identity,

    localizedTitles: { ...map, ...identity.localizedTitles },

    localizedTitle: title,

    confidence: source === 'parser' ? identity.confidence : Math.max(identity.confidence, 0.75),

  };



  if (identity.isSpecial) {
    const specialName = identity.specialTitle
      ? identity.specialTitle.replace(/\b\w/g, (c) => c.toUpperCase())
      : undefined;
    if (specialName && !title.toLowerCase().includes(specialName.toLowerCase())) {
      out.displayTitle = `${title} – ${specialName}`;
    } else {
      out.displayTitle = title;
    }
    return out;
  }

  if (identity.episodeNumber != null) {
    out.displayTitle = buildLocalizedDisplayTitle(identity, lang, item, manual);
  } else {
    out.displayTitle = title;
  }

  return out;

}


