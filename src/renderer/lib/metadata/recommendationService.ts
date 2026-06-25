import type { LibraryTitle } from '../mediaIntelligence/types';
import type { MediaItem } from '../../../shared/types';
import { FRANCHISE_CATALOG, getFranchiseCatalogEntry } from '../mediaIntelligence/franchise/franchiseCatalog';
import { findLibraryTitleByMediaId } from '../mediaIntelligence/libraryTitleService';
import { getTitleProgressSummary, resolveTitlePlayTarget } from '../mediaIntelligence/titlePlaybackService';
import { detectSeriesInFolder, findNextEpisodeInSeries } from '../mediaIntelligence/seriesGrouping';
import {
  getCatalogTitleByIdFromAnySource,
  resolveLocalAvailability,
} from './catalogService';
import type { CatalogMediaType, LocalAvailability, RecommendationItem } from './types';
import type { TranslationKey } from '../../../shared/i18n';

export interface DiscoverSection {
  id: string;
  titleKey: string;
  items: RecommendationItem[];
}

interface DiscoverCache {
  key: string;
  sections: DiscoverSection[];
}

let discoverCache: DiscoverCache | null = null;

function itemKey(item: RecommendationItem): string {
  return item.catalogId ?? item.localTitleId ?? item.title;
}

function pushUnique(
  bucket: RecommendationItem[],
  seen: Set<string>,
  item: RecommendationItem
): void {
  const key = itemKey(item);
  if (seen.has(key)) return;
  seen.add(key);
  bucket.push(item);
}

function titleNewestMtime(title: LibraryTitle): number {
  let max = 0;
  for (const item of title.items) {
    if (item.mtimeMs && item.mtimeMs > max) max = item.mtimeMs;
  }
  return max;
}

function mapLocalTitle(
  title: LibraryTitle,
  reasonKey: string,
  reason: string,
  score: number,
  availability: LocalAvailability = 'in_library'
): RecommendationItem {
  return {
    localTitleId: title.id,
    title: title.displayTitle,
    year: title.year,
    type: (title.mediaType as CatalogMediaType) ?? 'movie',
    localAvailability: availability,
    reason,
    reasonKey,
    score,
  };
}

function mapCatalogTitle(
  catalogTitleId: string,
  displayTitle: string,
  type: CatalogMediaType,
  year: number | undefined,
  posterUrl: string | undefined,
  availability: LocalAvailability,
  localTitleId: string | undefined,
  reasonKey: string,
  reason: string,
  score: number
): RecommendationItem {
  return {
    catalogId: catalogTitleId,
    localTitleId,
    title: displayTitle,
    year,
    type,
    posterUrl,
    localAvailability: availability,
    reason,
    reasonKey,
    score,
  };
}

function buildCacheKey(libraryTitles: LibraryTitle[], mediaItems: MediaItem[]): string {
  const titleIds = libraryTitles.length;
  const resumeSum = mediaItems.reduce((sum, item) => sum + (item.resumePositionSeconds ?? 0), 0);
  const franchiseIds = [...new Set(libraryTitles.map((t) => t.franchiseId).filter(Boolean))].sort().join(',');
  return `${titleIds}:${mediaItems.length}:${resumeSum}:${franchiseIds}`;
}

export function buildDiscoverSections(input: {
  libraryTitles: LibraryTitle[];
  mediaItems: MediaItem[];
  limitPerSection?: number;
}): DiscoverSection[] {
  const limit = input.limitPerSection ?? 12;
  const cacheKey = buildCacheKey(input.libraryTitles, input.mediaItems);
  if (discoverCache?.key === cacheKey) {
    return discoverCache.sections;
  }

  const globalSeen = new Set<string>();
  const sections: DiscoverSection[] = [];

  const continueItems: RecommendationItem[] = [];
  const continueSeen = new Set<string>();
  for (const media of input.mediaItems) {
    if (media.kind !== 'video' || (media.resumePositionSeconds ?? 0) < 30) continue;
    const title = findLibraryTitleByMediaId(input.libraryTitles, media.id);
    if (!title) continue;
    pushUnique(continueItems, continueSeen, {
      ...mapLocalTitle(title, 'discover.reason.continueWatching', 'continue', 100),
    });
    if (continueItems.length >= limit) break;
  }
  if (continueItems.length > 0) {
    sections.push({ id: 'continue', titleKey: 'discover.section.continue', items: continueItems });
    continueItems.forEach((item) => globalSeen.add(itemKey(item)));
  }

  const becauseWatched: RecommendationItem[] = [];
  const becauseSeen = new Set<string>();
  const recentWatched = input.mediaItems
    .filter((m) => m.kind === 'video' && (m.resumePositionSeconds ?? 0) > 60)
    .slice(0, 5);
  for (const media of recentWatched) {
    const title = findLibraryTitleByMediaId(input.libraryTitles, media.id);
    if (!title?.franchiseId) continue;
    const franchise = getFranchiseCatalogEntry(title.franchiseId);
    if (!franchise) continue;
    for (const catalogTitle of franchise.titles) {
      const { availability, localTitleId } = resolveLocalAvailability(
        catalogTitle.catalogTitleId,
        input.libraryTitles
      );
      if (availability === 'in_library' && localTitleId === title.id) continue;
      const year = Number.parseInt(catalogTitle.releaseDate.slice(0, 4), 10) || undefined;
      pushUnique(becauseWatched, becauseSeen, mapCatalogTitle(
        catalogTitle.catalogTitleId,
        catalogTitle.displayTitle,
        catalogTitle.type as CatalogMediaType,
        year,
        catalogTitle.posterUrl,
        availability,
        localTitleId,
        'discover.reason.becauseYouWatched',
        title.displayTitle,
        availability === 'not_in_library' ? 88 : 60
      ));
      if (becauseWatched.length >= limit) break;
    }
    if (becauseWatched.length >= limit) break;
  }
  const becauseFiltered = becauseWatched.filter((item) => !globalSeen.has(itemKey(item)));
  if (becauseFiltered.length > 0) {
    sections.push({
      id: 'because',
      titleKey: 'discover.section.becauseYouWatched',
      items: becauseFiltered.slice(0, limit),
    });
    becauseFiltered.forEach((item) => globalSeen.add(itemKey(item)));
  }

  const fromLibrary: RecommendationItem[] = [];
  const fromSeen = new Set<string>();
  const unwatched = input.libraryTitles.filter((title) => !getTitleProgressSummary(title).hasProgress);
  const curated = (unwatched.length > 0 ? unwatched : input.libraryTitles)
    .filter((title) => title.franchiseId)
    .slice(0, limit * 2);
  for (const title of curated) {
    pushUnique(fromLibrary, fromSeen, mapLocalTitle(
      title,
      'discover.reason.fromLibraryCurated',
      title.franchiseId ?? 'library',
      40
    ));
    if (fromLibrary.length >= limit) break;
  }
  const fromFiltered = fromLibrary.filter((item) => !globalSeen.has(itemKey(item)));
  if (fromFiltered.length > 0) {
    sections.push({
      id: 'library',
      titleKey: 'discover.section.fromLibrary',
      items: fromFiltered.slice(0, limit),
    });
    fromFiltered.forEach((item) => globalSeen.add(itemKey(item)));
  }

  const nextInSeries: RecommendationItem[] = [];
  const nextSeen = new Set<string>();
  for (const media of input.mediaItems) {
    if (media.kind !== 'video') continue;
    const progress = media.resumePositionSeconds ?? 0;
    if (progress < 30) continue;
    const folderVideos = input.mediaItems.filter(
      (item) => item.kind === 'video' && item.folder === media.folder
    );
    const series = detectSeriesInFolder(media, folderVideos);
    const next = series ? findNextEpisodeInSeries(media, series) : undefined;
    if (!next) continue;
    const title = findLibraryTitleByMediaId(input.libraryTitles, next.id);
    if (!title) continue;
    pushUnique(nextInSeries, nextSeen, mapLocalTitle(
      title,
      'discover.reason.nextInSeries',
      'next',
      95
    ));
    if (nextInSeries.length >= limit) break;
  }
  const nextFiltered = nextInSeries.filter((item) => !globalSeen.has(itemKey(item)));
  if (nextFiltered.length > 0) {
    sections.push({
      id: 'next',
      titleKey: 'discover.section.nextInSeries',
      items: nextFiltered.slice(0, limit),
    });
    nextFiltered.forEach((item) => globalSeen.add(itemKey(item)));
  }

  const missingFromFranchise: RecommendationItem[] = [];
  const missingSeen = new Set<string>();
  const franchiseIds = new Set(
    input.libraryTitles.map((t) => t.franchiseId).filter(Boolean) as string[]
  );
  for (const franchiseId of franchiseIds) {
    const franchise = getFranchiseCatalogEntry(franchiseId);
    if (!franchise) continue;
    for (const catalogTitle of franchise.titles) {
      const { availability, localTitleId } = resolveLocalAvailability(
        catalogTitle.catalogTitleId,
        input.libraryTitles
      );
      if (availability === 'in_library') continue;
      const year = Number.parseInt(catalogTitle.releaseDate.slice(0, 4), 10) || undefined;
      pushUnique(missingFromFranchise, missingSeen, mapCatalogTitle(
        catalogTitle.catalogTitleId,
        catalogTitle.displayTitle,
        catalogTitle.type as CatalogMediaType,
        year,
        catalogTitle.posterUrl,
        availability === 'partial' ? 'partial' : 'not_in_library',
        localTitleId,
        'discover.reason.missingFranchise',
        franchise.franchiseName,
        85
      ));
    }
  }
  const missingFiltered = missingFromFranchise
    .filter((item) => !globalSeen.has(itemKey(item)))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  if (missingFiltered.length > 0) {
    sections.push({
      id: 'missing',
      titleKey: 'discover.section.missing',
      items: missingFiltered,
    });
    missingFiltered.forEach((item) => globalSeen.add(itemKey(item)));
  }

  const similar: RecommendationItem[] = [];
  const similarSeen = new Set<string>();
  for (const franchise of FRANCHISE_CATALOG) {
    const hasLocal = input.libraryTitles.some((t) => t.franchiseId === franchise.franchiseId);
    if (!hasLocal) continue;
    for (const catalogTitle of franchise.titles) {
      const { availability, localTitleId } = resolveLocalAvailability(
        catalogTitle.catalogTitleId,
        input.libraryTitles
      );
      if (availability === 'in_library') continue;
      const year = Number.parseInt(catalogTitle.releaseDate.slice(0, 4), 10) || undefined;
      pushUnique(similar, similarSeen, mapCatalogTitle(
        catalogTitle.catalogTitleId,
        catalogTitle.displayTitle,
        catalogTitle.type as CatalogMediaType,
        year,
        catalogTitle.posterUrl,
        'metadata_only',
        localTitleId,
        'discover.reason.similarLibrary',
        franchise.franchiseName,
        55
      ));
      if (similar.length >= limit) break;
    }
    if (similar.length >= limit) break;
  }
  const similarFiltered = similar.filter((item) => !globalSeen.has(itemKey(item)));
  if (similarFiltered.length > 0) {
    sections.push({
      id: 'similar',
      titleKey: 'discover.section.similar',
      items: similarFiltered.slice(0, limit),
    });
    similarFiltered.forEach((item) => globalSeen.add(itemKey(item)));
  }

  const recentlyAdded = [...input.libraryTitles]
    .sort((a, b) => titleNewestMtime(b) - titleNewestMtime(a))
    .slice(0, limit)
    .map((title) => mapLocalTitle(title, 'discover.reason.recentlyAdded', 'recent', 35))
    .filter((item) => !globalSeen.has(itemKey(item)));
  if (recentlyAdded.length > 0) {
    sections.push({
      id: 'recent',
      titleKey: 'discover.section.recentlyAdded',
      items: recentlyAdded,
    });
    recentlyAdded.forEach((item) => globalSeen.add(itemKey(item)));
  }

  const metadataOnly: RecommendationItem[] = [];
  const metaSeen = new Set<string>();
  for (const franchise of FRANCHISE_CATALOG) {
    for (const catalogTitle of franchise.titles) {
      const { availability, localTitleId } = resolveLocalAvailability(
        catalogTitle.catalogTitleId,
        input.libraryTitles
      );
      if (availability === 'in_library') continue;
      const year = Number.parseInt(catalogTitle.releaseDate.slice(0, 4), 10) || undefined;
      pushUnique(metadataOnly, metaSeen, mapCatalogTitle(
        catalogTitle.catalogTitleId,
        catalogTitle.displayTitle,
        catalogTitle.type as CatalogMediaType,
        year,
        catalogTitle.posterUrl,
        'metadata_only',
        localTitleId,
        'discover.reason.metadataOnly',
        franchise.franchiseName,
        30
      ));
      if (metadataOnly.length >= limit) break;
    }
    if (metadataOnly.length >= limit) break;
  }
  const metaFiltered = metadataOnly.filter((item) => !globalSeen.has(itemKey(item))).slice(0, limit);
  if (metaFiltered.length > 0) {
    sections.push({
      id: 'metadata',
      titleKey: 'discover.section.metadataOnly',
      items: metaFiltered,
    });
  }

  discoverCache = { key: cacheKey, sections };
  return sections;
}

export function buildLocalRecommendations(input: {
  libraryTitles: LibraryTitle[];
  mediaItems: MediaItem[];
  currentMediaId?: string;
  limit?: number;
}): RecommendationItem[] {
  const sections = buildDiscoverSections({
    libraryTitles: input.libraryTitles,
    mediaItems: input.mediaItems,
    limitPerSection: input.limit ?? 8,
  });
  const merged: RecommendationItem[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      const key = itemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= (input.limit ?? 12)) return merged;
    }
  }
  return merged;
}

export function invalidateDiscoverCache(): void {
  discoverCache = null;
}

export function resolveCardPrimaryAction(
  item: RecommendationItem,
  localTitle: LibraryTitle | undefined,
  t: (key: TranslationKey) => string
): { label: string; show: boolean; playable: boolean } {
  if (item.localAvailability === 'metadata_only' || item.localAvailability === 'not_in_library') {
    return { label: t('catalog.openDetails'), show: true, playable: false };
  }
  if (!localTitle) {
    return { label: t('catalog.openDetails'), show: true, playable: false };
  }
  const progress = getTitleProgressSummary(localTitle);
  const playTarget = resolveTitlePlayTarget(localTitle);
  if (!playTarget) {
    return { label: t('catalog.openDetails'), show: true, playable: false };
  }
  if (progress.hasProgress) {
    return { label: t('media.titles.continue'), show: true, playable: true };
  }
  if (localTitle.mediaType === 'series' && localTitle.uniqueEpisodeCount > 1) {
    return { label: t('media.titles.startWatching'), show: true, playable: true };
  }
  return { label: t('player.play'), show: true, playable: true };
}
