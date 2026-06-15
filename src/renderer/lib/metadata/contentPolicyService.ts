import type { MetadataSearchResult } from './types';

const ADULT_GENRES = new Set(['hentai', 'erotica', 'adult']);
const ADULT_KEYWORDS = /\b(hentai|ecchi|ero|xxx|porn|shinryou tsumaka)\b/i;
const SEXY_SOLDIERS_PATTERN = /\bsexy\s+\w+\s+soldiers\b/i;

function matchesAdultKeywords(hay: string): boolean {
  if (ADULT_KEYWORDS.test(hay)) return true;
  if (SEXY_SOLDIERS_PATTERN.test(hay)) return true;
  const lower = hay.toLowerCase();
  return /\bsexy\b/.test(lower) && /\bsoldiers\b/.test(lower);
}

export function isLikelyAdultResult(item: MetadataSearchResult): boolean {
  if (item.isAdult === true) return true;
  const genres = (item.genres ?? []).map((g) => g.toLowerCase());
  if (genres.some((g) => ADULT_GENRES.has(g))) return true;
  const hay = [item.title, item.originalTitle, item.overview].filter(Boolean).join(' ');
  return matchesAdultKeywords(hay);
}

export function filterCatalogResults(
  items: MetadataSearchResult[],
  includeAdultContent: boolean
): MetadataSearchResult[] {
  if (includeAdultContent) return items;
  return items.filter((item) => !isLikelyAdultResult(item));
}
