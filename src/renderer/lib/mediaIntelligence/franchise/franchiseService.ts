import type { LibraryTitle } from '../types';
import {
  FRANCHISE_CATALOG,
  getFranchiseCatalogEntry,
  orderIndexForMode,
  type FranchiseCatalogEntry,
  type FranchiseCatalogTitle,
  type FranchiseWatchOrderMode,
} from './franchiseCatalog';
import {
  matchCatalogTitleToLibrary,
  matchLibraryTitleToCatalog,
  normalizeFranchiseText,
  resolveFranchiseForLibraryTitle,
  resolveFranchiseLibraryStatus,
  type FranchiseLibraryStatus,
} from './franchiseMatcher';

export interface FranchiseTitleView {
  catalogTitle: FranchiseCatalogTitle;
  orderIndex: number;
  inLibrary: boolean;
  libraryStatus: FranchiseLibraryStatus;
  localTitle?: LibraryTitle;
  localTitleId?: string;
  matchConfidence: number;
  episodeCount?: number;
}

export interface FranchiseHubView {
  franchise: FranchiseCatalogEntry;
  orderMode: FranchiseWatchOrderMode;
  titles: FranchiseTitleView[];
  localCount: number;
}

export interface FranchiseTitleContextView {
  franchise: FranchiseCatalogEntry;
  current?: FranchiseTitleView;
  before: FranchiseTitleView[];
  after: FranchiseTitleView[];
  sameFranchise: FranchiseTitleView[];
  orderMode: FranchiseWatchOrderMode;
}

export interface FranchiseSearchResult {
  franchise: FranchiseCatalogEntry;
  localMatchCount: number;
}

export function buildFindOnlineSearchUrl(title: string): string {
  const query = encodeURIComponent(`${title} watch online`);
  return `https://www.google.com/search?q=${query}`;
}

function buildTitleView(
  catalogTitle: FranchiseCatalogTitle,
  orderMode: FranchiseWatchOrderMode,
  libraryTitles: LibraryTitle[]
): FranchiseTitleView {
  const match = matchCatalogTitleToLibrary(catalogTitle, libraryTitles);
  const libraryStatus = resolveFranchiseLibraryStatus(match.confidence);
  const inLibrary = libraryStatus === 'in_library';
  const episodeCount = inLibrary && match.localTitle
    ? match.localTitle.uniqueEpisodeCount
    : undefined;

  return {
    catalogTitle,
    orderIndex: orderIndexForMode(catalogTitle, orderMode),
    inLibrary,
    libraryStatus,
    localTitle: match.localTitle,
    localTitleId: match.localTitle?.id,
    matchConfidence: match.confidence,
    episodeCount,
  };
}

export function buildFranchiseHubView(
  franchiseId: string,
  libraryTitles: LibraryTitle[],
  orderMode: FranchiseWatchOrderMode = 'release'
): FranchiseHubView | undefined {
  const franchise = getFranchiseCatalogEntry(franchiseId);
  if (!franchise) return undefined;

  const titles = franchise.titles
    .map((catalogTitle) => buildTitleView(catalogTitle, orderMode, libraryTitles))
    .sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    franchise,
    orderMode,
    titles,
    localCount: titles.filter((title) => title.inLibrary).length,
  };
}

export function buildFranchiseTitleContext(
  libraryTitle: LibraryTitle,
  libraryTitles: LibraryTitle[],
  orderMode: FranchiseWatchOrderMode = 'release'
): FranchiseTitleContextView | undefined {
  const franchise = resolveFranchiseForLibraryTitle(libraryTitle);
  if (!franchise) return undefined;

  const hub = buildFranchiseHubView(franchise.franchiseId, libraryTitles, orderMode);
  if (!hub) return undefined;

  const currentMatch = matchLibraryTitleToCatalog(libraryTitle, franchise);
  const current = currentMatch.catalogTitle
    ? hub.titles.find((entry) => entry.catalogTitle.catalogTitleId === currentMatch.catalogTitle?.catalogTitleId)
    : undefined;

  if (!current) {
    return {
      franchise,
      orderMode,
      current: undefined,
      before: [],
      after: [],
      sameFranchise: hub.titles,
    };
  }

  const before = hub.titles.filter((entry) => entry.orderIndex < current.orderIndex);
  const after = hub.titles.filter((entry) => entry.orderIndex > current.orderIndex);
  const sameFranchise = hub.titles.filter(
    (entry) => entry.catalogTitle.catalogTitleId !== current.catalogTitle.catalogTitleId
  );

  return {
    franchise,
    current,
    before,
    after,
    sameFranchise,
    orderMode,
  };
}

export function searchFranchises(
  query: string,
  libraryTitles: LibraryTitle[]
): FranchiseSearchResult[] {
  const q = normalizeFranchiseText(query);
  if (!q || q.length < 2) return [];

  return FRANCHISE_CATALOG
    .map((franchise) => {
      const haystack = normalizeFranchiseText([
        franchise.franchiseName,
        franchise.description ?? '',
        ...franchise.titles.flatMap((title) => [title.displayTitle, ...title.aliases]),
      ].join(' '));

      const tokens = q.split(' ').filter((token) => token.length > 1);
      const matches = tokens.length === 0
        ? haystack.includes(q)
        : tokens.every((token) => haystack.includes(token));
      if (!matches) return undefined;

      const hub = buildFranchiseHubView(franchise.franchiseId, libraryTitles);
      return {
        franchise,
        localMatchCount: hub?.localCount ?? 0,
      };
    })
    .filter((entry): entry is FranchiseSearchResult => Boolean(entry));
}

export function listFranchises(): FranchiseCatalogEntry[] {
  return FRANCHISE_CATALOG;
}
