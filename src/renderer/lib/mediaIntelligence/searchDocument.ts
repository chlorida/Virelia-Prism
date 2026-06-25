import type { MediaItem } from '../../../shared/types';
import type { MediaDisplayLanguage } from './languageResolution';
import { buildMediaDisplayIdentity } from './mediaIdentityService';
import { getCachedParsedIdentity } from './mediaIdentityCache';
import { findSeriesAlias, normalizeAliasKey } from './aliasCache';

export const SEARCH_INDEX_VERSION = 3;

function pushTerm(bucket: Set<string>, value: string | undefined): void {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return;
  bucket.add(trimmed.toLocaleLowerCase());
}

function pushLocalizedMap(bucket: Set<string>, map?: { en?: string; ru?: string; ja?: string; romaji?: string; original?: string }): void {
  if (!map) return;
  for (const value of Object.values(map)) pushTerm(bucket, value);
}

/** Collect all searchable phrases for one media item (built once, cached in searchText). */
export function buildSearchDocument(item: MediaItem, language: MediaDisplayLanguage = 'en'): string[] {
  const terms = new Set<string>();

  pushTerm(terms, item.fileName);
  pushTerm(terms, item.folder);
  pushTerm(terms, item.title);
  pushTerm(terms, item.artist);
  pushTerm(terms, item.album);
  for (const tag of item.tags) pushTerm(terms, tag);

  const parsed = getCachedParsedIdentity(item);
  pushTerm(terms, parsed.rawFilename);
  pushTerm(terms, parsed.cleanTitle);
  pushTerm(terms, parsed.probableSeriesTitle);
  pushTerm(terms, parsed.probableTitle);
  pushTerm(terms, parsed.displayTitle);
  pushTerm(terms, parsed.originalTitle);
  pushTerm(terms, parsed.specialTitle);
  pushTerm(terms, parsed.specialType);
  pushTerm(terms, parsed.releaseGroup);
  pushTerm(terms, parsed.franchiseId);
  pushTerm(terms, parsed.cleanSearchQuery);
  pushTerm(terms, parsed.canonicalTitle);
  for (const tag of parsed.versionTags ?? []) pushTerm(terms, tag);
  for (const tag of parsed.releaseGroupTags ?? []) pushTerm(terms, tag);
  pushLocalizedMap(terms, parsed.localizedTitles);

  if (parsed.episodeNumber != null) {
    const ep = String(parsed.episodeNumber);
    const padded = ep.padStart(2, '0');
    pushTerm(terms, `episode ${ep}`);
    pushTerm(terms, `episode ${padded}`);
    pushTerm(terms, `ep ${ep}`);
    pushTerm(terms, `ep ${padded}`);
  }

  const alias = findSeriesAlias(normalizeAliasKey(parsed.probableSeriesTitle ?? parsed.cleanTitle));
  pushLocalizedMap(terms, alias?.titles);

  for (const lang of ['en', 'ru'] as const) {
    const display = buildMediaDisplayIdentity(item, lang);
    pushTerm(terms, display.title);
    pushTerm(terms, display.subtitle);
    pushTerm(terms, display.originalTitle);
    pushTerm(terms, display.episodeLabel);
    pushLocalizedMap(terms, display.localizedTitles);
    for (const chip of display.technicalChips) pushTerm(terms, chip);
  }

  return [...terms];
}

export function normalizeSearchBlob(parts: Iterable<string>): string {
  const joined = [...parts]
    .map((part) => part
      .toLocaleLowerCase()
      .replace(/[:\u2013\u2014\-_./,()[\]{}]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .join(' ');
  return joined.replace(/\s+/g, ' ').trim();
}

export function buildSearchBlobFromItem(item: MediaItem): string {
  return normalizeSearchBlob(buildSearchDocument(item));
}
