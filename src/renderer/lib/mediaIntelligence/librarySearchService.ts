import { SERIES_ALIAS_ENTRIES, WORK_ALIAS_ENTRIES } from './aliasCache';
import { getCachedParsedIdentity } from './mediaIdentityCache';
import { FRANCHISE_CATALOG } from './franchise/franchiseCatalog';
import type { FranchiseCatalogTitle } from './franchise/franchiseCatalog';
import {
  matchCatalogTitleToLibrary,
  normalizeFranchiseText,
} from './franchise/franchiseMatcher';
import { searchFranchises, type FranchiseSearchResult } from './franchise/franchiseService';
import type { LibraryEpisode, LibraryTitle } from './types';
import { matchesSearchTokens, normalizeSearchText, tokenizeSearchQuery } from '../searchNormalize';

export type LibrarySearchMatchKind = 'exact' | 'normalized' | 'alias' | 'partial' | 'fuzzy';

export interface LocalTitleSearchHit {
  title: LibraryTitle;
  episode?: LibraryEpisode;
  score: number;
  matchKind: LibrarySearchMatchKind;
}

export interface CatalogTitleSearchHit {
  catalogTitle: FranchiseCatalogTitle;
  franchiseId: string;
  franchiseName: string;
  inLibrary: boolean;
  localTitleId?: string;
  score: number;
  matchKind: LibrarySearchMatchKind;
}

export interface UnifiedLibrarySearchResults {
  query: string;
  local: LocalTitleSearchHit[];
  franchises: FranchiseSearchResult[];
  catalog: CatalogTitleSearchHit[];
  hasResults: boolean;
}

function aliasHaystack(): string[] {
  const parts: string[] = [];
  for (const entry of [...SERIES_ALIAS_ENTRIES, ...WORK_ALIAS_ENTRIES]) {
    parts.push(...entry.keys);
    for (const value of Object.values(entry.titles)) {
      if (value) parts.push(value);
    }
  }
  return parts;
}

const ALIAS_PARTS = aliasHaystack();

export function buildLibraryTitleSearchHaystack(title: LibraryTitle): string {
  const parts: string[] = [
    title.displayTitle,
    title.canonicalTitle ?? '',
    title.localizedTitle ?? '',
    title.franchiseId ?? '',
    title.year != null ? String(title.year) : '',
    title.mediaType,
    ...(title.versionTags ?? []),
    ...(title.technicalTags ?? []),
  ];

  for (const item of title.items) {
    parts.push(item.fileName, item.title, item.folder ?? '');
    const parsed = getCachedParsedIdentity(item);
    parts.push(
      parsed.cleanTitle ?? '',
      parsed.canonicalTitle ?? '',
      parsed.probableSeriesTitle ?? '',
      parsed.localizedTitle ?? '',
      parsed.originalTitle ?? '',
    );
    if (parsed.episodeNumber != null) {
      parts.push(`episode ${parsed.episodeNumber}`, `ep ${parsed.episodeNumber}`);
    }
    if (parsed.seasonNumber != null) {
      parts.push(`season ${parsed.seasonNumber}`);
    }
  }

  for (const episode of title.episodes ?? []) {
    parts.push(episode.displayTitle);
    if (episode.episodeNumber != null) {
      parts.push(`episode ${episode.episodeNumber}`, `ep ${episode.episodeNumber}`);
    }
    for (const version of episode.versions) {
      parts.push(version.filename);
    }
  }

  return parts.filter(Boolean).join(' ');
}

function scoreLocalMatch(haystack: string, query: string): { score: number; matchKind: LibrarySearchMatchKind } | null {
  const normalizedHaystack = normalizeSearchText(haystack);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;

  if (normalizedHaystack === normalizedQuery) {
    return { score: 100, matchKind: 'exact' };
  }

  const displayNorm = normalizeSearchText(haystack.split(' ').slice(0, 12).join(' '));
  if (displayNorm.includes(normalizedQuery) && normalizedQuery.length >= 3) {
    return { score: 92, matchKind: 'normalized' };
  }

  for (const alias of ALIAS_PARTS) {
    const aliasNorm = normalizeSearchText(alias);
    if (!aliasNorm) continue;
    if (aliasNorm.includes(normalizedQuery) && normalizedHaystack.includes(aliasNorm)) {
      return { score: 85, matchKind: 'alias' };
    }
    if (normalizedHaystack.includes(aliasNorm) && aliasNorm.includes(normalizedQuery)) {
      return { score: 84, matchKind: 'alias' };
    }
  }

  if (matchesSearchTokens(haystack, query)) {
    const tokens = tokenizeSearchQuery(query);
    const allTokensShort = tokens.every((token) => token.length <= 3);
    return {
      score: allTokensShort ? 72 : 78,
      matchKind: 'partial',
    };
  }

  const franchiseNorm = normalizeFranchiseText(haystack);
  const queryNorm = normalizeFranchiseText(query);
  if (queryNorm.length >= 2 && franchiseNorm.includes(queryNorm)) {
    return { score: 68, matchKind: 'fuzzy' };
  }

  return null;
}

function scoreCatalogMatch(
  catalogTitle: FranchiseCatalogTitle,
  franchiseName: string,
  query: string
): { score: number; matchKind: LibrarySearchMatchKind } | null {
  const names = [catalogTitle.displayTitle, ...catalogTitle.aliases, franchiseName];
  let best: { score: number; matchKind: LibrarySearchMatchKind } | null = null;

  for (const name of names) {
    const hit = scoreLocalMatch(name, query);
    if (!hit) continue;
    const boosted = hit.matchKind === 'alias' ? hit.score + 2 : hit.score;
    if (!best || boosted > best.score) {
      best = { score: boosted - 8, matchKind: hit.matchKind };
    }
  }

  const combined = scoreLocalMatch(names.join(' '), query);
  if (combined && (!best || combined.score > best.score)) {
    best = { score: combined.score - 10, matchKind: combined.matchKind };
  }

  return best;
}

function searchLocalTitles(titles: LibraryTitle[], query: string): LocalTitleSearchHit[] {
  const hits: LocalTitleSearchHit[] = [];

  for (const title of titles) {
    const titleHaystack = buildLibraryTitleSearchHaystack(title);
    const titleHit = scoreLocalMatch(titleHaystack, query);
    if (titleHit) {
      hits.push({ title, score: titleHit.score, matchKind: titleHit.matchKind });
    }

    for (const episode of title.episodes ?? []) {
      const episodeHaystack = [
        titleHaystack,
        episode.displayTitle,
        episode.episodeNumber != null ? `episode ${episode.episodeNumber}` : '',
      ].join(' ');
      const episodeHit = scoreLocalMatch(episodeHaystack, query);
      if (!episodeHit) continue;
      const episodeOnly = scoreLocalMatch(episode.displayTitle, query);
      if (episodeOnly || (episode.episodeNumber != null && query.match(/\d/))) {
        hits.push({
          title,
          episode,
          score: episodeHit.score + (episodeOnly ? 4 : 0),
          matchKind: episodeHit.matchKind,
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score || a.title.displayTitle.localeCompare(b.title.displayTitle));

  const seen = new Set<string>();
  const deduped: LocalTitleSearchHit[] = [];
  for (const hit of hits) {
    const key = hit.episode ? `${hit.title.id}:${hit.episode.id}` : hit.title.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(hit);
  }
  return deduped;
}

function searchCatalogTitles(
  query: string,
  libraryTitles: LibraryTitle[]
): CatalogTitleSearchHit[] {
  const hits: CatalogTitleSearchHit[] = [];

  for (const franchise of FRANCHISE_CATALOG) {
    for (const catalogTitle of franchise.titles) {
      const scored = scoreCatalogMatch(catalogTitle, franchise.franchiseName, query);
      if (!scored || scored.score < 55) continue;
      const match = matchCatalogTitleToLibrary(catalogTitle, libraryTitles);
      hits.push({
        catalogTitle,
        franchiseId: franchise.franchiseId,
        franchiseName: franchise.franchiseName,
        inLibrary: Boolean(match.localTitle),
        localTitleId: match.localTitle?.id,
        score: scored.score,
        matchKind: scored.matchKind,
      });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.catalogTitle.displayTitle.localeCompare(b.catalogTitle.displayTitle));
  return hits;
}

export function runUnifiedLibrarySearch(
  query: string,
  libraryTitles: LibraryTitle[]
): UnifiedLibrarySearchResults {
  const trimmed = query.trim();
  if (!trimmed) {
    return { query: trimmed, local: [], franchises: [], catalog: [], hasResults: false };
  }

  const local = searchLocalTitles(libraryTitles, trimmed);
  const franchises = searchFranchises(trimmed, libraryTitles);
  const catalog = searchCatalogTitles(trimmed, libraryTitles);

  const franchiseIds = new Set(franchises.map((entry) => entry.franchise.franchiseId));
  const filteredCatalog = catalog.filter((hit) => {
    if (franchiseIds.has(hit.franchiseId)) {
      const franchiseOnly = scoreCatalogMatch(hit.catalogTitle, hit.franchiseName, trimmed);
      return franchiseOnly != null && franchiseOnly.score >= 70;
    }
    return true;
  });

  const hasResults = local.length > 0 || franchises.length > 0 || filteredCatalog.length > 0;

  return {
    query: trimmed,
    local,
    franchises,
    catalog: filteredCatalog,
    hasResults,
  };
}

export function filterLibraryTitles(titles: LibraryTitle[], query: string): LibraryTitle[] {
  const q = query.trim();
  if (!q) return titles;
  return runUnifiedLibrarySearch(q, titles).local.map((hit) => hit.title);
}
