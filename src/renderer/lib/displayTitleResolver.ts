import type { LibraryTitle } from './mediaIntelligence/types';
import type { CatalogTitle, MetadataSearchResult } from './metadata/types';
import type { AppSettings } from '../../shared/types';

export interface DisplayTitle {
  title: string;
  originalTitle?: string;
  subtitle?: string;
}

export function resolvePreferredMetadataLanguage(settings?: AppSettings): string {
  const lang = settings?.metadata?.preferredLanguage ?? 'auto';
  if (lang === 'auto') {
    return typeof navigator !== 'undefined' ? (navigator.language.split('-')[0] ?? 'en') : 'en';
  }
  return lang;
}

function pickEnglishFirst(names: {
  english?: string;
  romaji?: string;
  native?: string;
  display?: string;
}): { title: string; original?: string } {
  const english = names.english?.trim();
  const display = names.display?.trim();
  const romaji = names.romaji?.trim();
  const native = names.native?.trim();
  const title = english || display || romaji || native || 'Unknown';
  const original = native && native !== title ? native : romaji && romaji !== title ? romaji : undefined;
  return { title, original };
}

export function resolveDisplayTitleFromCatalog(catalog: Pick<
  CatalogTitle,
  'title' | 'originalTitle' | 'romanizedTitle'
>): DisplayTitle {
  const title = catalog.title?.trim() || catalog.romanizedTitle?.trim() || 'Unknown';
  const original = catalog.originalTitle?.trim();
  return {
    title,
    originalTitle: original && original !== title ? original : catalog.romanizedTitle,
  };
}

export function resolveDisplayTitleFromSearchResult(item: MetadataSearchResult): DisplayTitle {
  return {
    title: item.title,
    originalTitle: item.originalTitle && item.originalTitle !== item.title ? item.originalTitle : undefined,
  };
}

export function resolveDisplayTitleFromLibraryTitle(
  title: LibraryTitle,
  _settings?: AppSettings
): DisplayTitle {
  const display = title.displayTitle?.trim() || title.canonicalTitle?.trim() || 'Unknown';
  const original = title.localizedTitle?.trim();
  return {
    title: display,
    originalTitle: original && original !== display ? original : undefined,
    subtitle: title.franchiseId,
  };
}

export function resolveDisplayTitle(input: {
  localTitle?: LibraryTitle;
  catalog?: CatalogTitle;
  searchResult?: MetadataSearchResult;
  fallback?: string;
  settings?: AppSettings;
}): DisplayTitle {
  if (input.catalog) return resolveDisplayTitleFromCatalog(input.catalog);
  if (input.searchResult) return resolveDisplayTitleFromSearchResult(input.searchResult);
  if (input.localTitle) return resolveDisplayTitleFromLibraryTitle(input.localTitle, input.settings);
  return { title: input.fallback?.trim() || 'Unknown' };
}

export function formatCardTitle(display: DisplayTitle): { primary: string; secondary?: string } {
  return {
    primary: display.title,
    secondary: display.originalTitle,
  };
}
