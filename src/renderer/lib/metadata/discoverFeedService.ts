import type { LibraryTitle } from '../mediaIntelligence/types';
import type { MediaItem } from '../../../shared/types';
import { findLibraryTitleByMediaId } from '../mediaIntelligence/libraryTitleService';
import { buildDiscoverSections } from './recommendationService';
import { resolveLocalAvailability } from './catalogService';
import { filterCatalogResults } from './contentPolicyService';
import { buildUserAffinityProfile } from './userAffinityService';
import {
  DISCOVER_GENRES,
  fetchDiscoverSectionPage,
  genreSlug,
} from './discoverCatalogService';
import type { UserAffinityProfile } from './userAffinityService';
import type { MetadataSearchResult, RecommendationItem } from './types';

export type DiscoverFeedPhase = 'personal' | 'affinityGenres' | 'trending' | 'remainingGenres';

export interface DiscoverFeedCursor {
  phase: DiscoverFeedPhase;
  genreIndex: number;
  page: number;
  shownSectionIds: string[];
  shownGenreKeys: string[];
}

export interface DiscoverFeedSectionModel {
  id: string;
  titleKey: string;
  subtitleKey?: string;
  kind: 'local' | 'mixed' | 'online';
  items: RecommendationItem[];
  hasMore: boolean;
}

export interface DiscoverFeedContext {
  libraryTitles: LibraryTitle[];
  mediaItems: MediaItem[];
  favoriteIds: Set<string>;
  watchlistCatalogIds: string[];
  includeAdultContent: boolean;
  affinity: UserAffinityProfile;
}

export interface CompactForYouInput {
  libraryTitles: LibraryTitle[];
  mediaItems: MediaItem[];
  favoriteIds: Set<string>;
  watchlistCatalogIds: string[];
  includeAdultContent?: boolean;
  currentMediaId?: string;
  limit?: number;
}

const BATCH_SIZE = 2;
const INITIAL_SECTION_LIMIT = 16;
const TRENDING_SECTION_SPECS: Array<{
  id: string;
  titleKey: string;
  subtitleKey?: string;
  kind: 'online' | 'mixed';
}> = [
  { id: 'trending', titleKey: 'discover.section.trending', subtitleKey: 'discover.section.trendingSubtitle', kind: 'mixed' },
  { id: 'popular-movies', titleKey: 'discover.section.popularMovies', subtitleKey: 'discover.section.popularMoviesSubtitle', kind: 'mixed' },
  { id: 'popular-series', titleKey: 'discover.section.popularSeries', subtitleKey: 'discover.section.popularSeriesSubtitle', kind: 'mixed' },
  { id: 'popular-anime', titleKey: 'discover.section.popularAnime', subtitleKey: 'discover.section.popularAnimeSubtitle', kind: 'online' },
];

export const INITIAL_DISCOVER_FEED_CURSOR: DiscoverFeedCursor = {
  phase: 'personal',
  genreIndex: 0,
  page: 0,
  shownSectionIds: [],
  shownGenreKeys: [],
};

function itemKey(item: RecommendationItem): string {
  return item.catalogId ?? item.localTitleId ?? item.title;
}

function popularityNorm(item: MetadataSearchResult | RecommendationItem): number {
  const pop = item.popularity ?? ('confidence' in item ? item.confidence * 100 : 0);
  return Math.min(1, Math.log10(Math.max(1, pop)) / 5);
}

function normalizeGenreToken(value: string): string {
  const token = value.trim().toLowerCase();
  if (token === 'sci-fi' || token === 'science fiction') return 'science-fiction';
  return token;
}

function genreAffinityScore(genres: string[] | undefined, genreWeights: Record<string, number>): number {
  if (!genres?.length) return 0;
  let max = 0;
  for (const genre of genres) {
    const normalized = normalizeGenreToken(genre);
    for (const [key, weight] of Object.entries(genreWeights)) {
      if (normalizeGenreToken(key) === normalized) {
        max = Math.max(max, weight);
      }
    }
  }
  return max;
}

function scoreDiscoverItem(
  item: MetadataSearchResult,
  affinity: UserAffinityProfile,
  libraryTitles: LibraryTitle[]
): number {
  const affinityMatch = genreAffinityScore(item.genres, affinity.genreWeights);
  const titleWeight = item.catalogId ? (affinity.titleWeights.get(item.catalogId) ?? 0) : 0;
  const affinityComponent = Math.min(1, affinityMatch + titleWeight * 0.25);
  const popularity = popularityNorm(item);
  const novelty = 1;
  return (affinityComponent * 0.5 + popularity * 0.3 + novelty * 0.2) * 100;
}

function mapSearchResultToRecommendation(
  item: MetadataSearchResult,
  context: DiscoverFeedContext
): RecommendationItem {
  const { availability, localTitleId } = resolveLocalAvailability(item.catalogId, context.libraryTitles);
  return {
    catalogId: item.catalogId,
    localTitleId,
    title: item.title,
    year: item.year,
    type: item.type,
    posterUrl: item.posterUrl,
    genres: item.genres,
    formatKind: item.formatKind,
    popularity: item.popularity,
    localAvailability: availability,
    reason: '',
    reasonKey: 'discover.reason.recommended',
    score: scoreDiscoverItem(item, context.affinity, context.libraryTitles),
  };
}

function sortGenresByAffinity(genres: readonly string[], genreWeights: Record<string, number>): string[] {
  return [...genres].sort((a, b) => {
    const weightA = genreAffinityScore([a], genreWeights);
    const weightB = genreAffinityScore([b], genreWeights);
    if (weightB !== weightA) return weightB - weightA;
    return genres.indexOf(a) - genres.indexOf(b);
  });
}

function buildPersonalSections(context: DiscoverFeedContext): DiscoverFeedSectionModel[] {
  return buildDiscoverSections({
    libraryTitles: context.libraryTitles,
    mediaItems: context.mediaItems,
    limitPerSection: INITIAL_SECTION_LIMIT,
  })
    .filter((section) => section.id === 'continue' || section.id === 'because')
    .map((section) => ({
      id: section.id,
      titleKey: section.titleKey,
      kind: 'local' as const,
      items: section.items,
      hasMore: false,
    }));
}

async function buildOnlineSection(
  sectionId: string,
  titleKey: string,
  subtitleKey: string | undefined,
  kind: 'online' | 'mixed',
  context: DiscoverFeedContext
): Promise<DiscoverFeedSectionModel | null> {
  const raw = await fetchDiscoverSectionPage(sectionId, 0, INITIAL_SECTION_LIMIT);
  const filtered = filterCatalogResults(raw, context.includeAdultContent);
  if (filtered.length === 0) return null;

  const items = filtered
    .map((item) => mapSearchResultToRecommendation(item, context))
    .sort((a, b) => b.score - a.score);

  return {
    id: sectionId,
    titleKey,
    subtitleKey,
    kind,
    items,
    hasMore: filtered.length >= INITIAL_SECTION_LIMIT,
  };
}

async function buildGenreSection(genre: string, context: DiscoverFeedContext): Promise<DiscoverFeedSectionModel | null> {
  const sectionId = `genre-${genreSlug(genre)}`;
  return buildOnlineSection(
    sectionId,
    `discover.genre.${genreSlug(genre)}`,
    'discover.section.genreSubtitle',
    'mixed',
    context
  );
}

function rescoreRecommendationItem(item: RecommendationItem, affinity: UserAffinityProfile): RecommendationItem {
  const affinityMatch = genreAffinityScore(item.genres, affinity.genreWeights);
  const titleWeight = item.localTitleId
    ? (affinity.titleWeights.get(item.localTitleId) ?? 0)
    : item.catalogId
      ? (affinity.titleWeights.get(item.catalogId) ?? 0)
      : 0;
  const affinityComponent = Math.min(1, affinityMatch + titleWeight * 0.25);
  const popularity = popularityNorm(item);
  const score = (affinityComponent * 0.5 + popularity * 0.3 + 1 * 0.2) * 100;
  return { ...item, score: Math.max(item.score, score) };
}

function toDiscoverFeedContext(input: CompactForYouInput): DiscoverFeedContext {
  return {
    libraryTitles: input.libraryTitles,
    mediaItems: input.mediaItems,
    favoriteIds: input.favoriteIds,
    watchlistCatalogIds: input.watchlistCatalogIds,
    includeAdultContent: input.includeAdultContent ?? false,
    affinity: buildUserAffinityProfile({
      libraryTitles: input.libraryTitles,
      mediaItems: input.mediaItems,
      favoriteIds: input.favoriteIds,
      watchlistCatalogIds: input.watchlistCatalogIds,
    }),
  };
}

export function getCompactForYouItems(input: CompactForYouInput): RecommendationItem[] {
  const limit = input.limit ?? 6;
  const context = toDiscoverFeedContext(input);
  const currentTitleId = input.currentMediaId
    ? findLibraryTitleByMediaId(input.libraryTitles, input.currentMediaId)?.id
    : undefined;

  const sections = buildDiscoverSections({
    libraryTitles: context.libraryTitles,
    mediaItems: context.mediaItems,
    limitPerSection: 8,
  });

  const result: RecommendationItem[] = [];
  const seen = new Set<string>();

  const isExcluded = (item: RecommendationItem) =>
    Boolean(currentTitleId && item.localTitleId === currentTitleId);

  const continueSection = sections.find((section) => section.id === 'continue');
  if (continueSection?.items[0]) {
    const hero = continueSection.items[0];
    if (!isExcluded(hero)) {
      result.push(hero);
      seen.add(itemKey(hero));
    }
  }

  const candidates: RecommendationItem[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      const key = itemKey(item);
      if (seen.has(key) || isExcluded(item)) continue;
      candidates.push(rescoreRecommendationItem(item, context.affinity));
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const item of candidates) {
    if (result.length >= limit) break;
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result.slice(0, limit);
}

export async function getNextDiscoverSections(
  cursor: DiscoverFeedCursor,
  context: DiscoverFeedContext
): Promise<{ sections: DiscoverFeedSectionModel[]; nextCursor: DiscoverFeedCursor | null }> {
  const state: DiscoverFeedCursor = {
    ...cursor,
    shownSectionIds: [...cursor.shownSectionIds],
    shownGenreKeys: [...cursor.shownGenreKeys],
  };
  const sections: DiscoverFeedSectionModel[] = [];

  for (let guard = 0; guard < 8 && sections.length < BATCH_SIZE; guard += 1) {
    const beforeCount = sections.length;
    const beforePhase = state.phase;

    if (state.phase === 'personal') {
      const personal = buildPersonalSections(context).filter(
        (section) => !state.shownSectionIds.includes(section.id)
      );
      const take = personal.slice(0, BATCH_SIZE - sections.length);
      sections.push(...take);
      for (const section of take) state.shownSectionIds.push(section.id);

      if (personal.length === 0 || take.length === personal.length) {
        state.phase = context.affinity.isColdStart ? 'trending' : 'affinityGenres';
        state.genreIndex = 0;
      }
    } else if (state.phase === 'affinityGenres') {
      const sorted = sortGenresByAffinity(DISCOVER_GENRES, context.affinity.genreWeights);
      const remaining = sorted.filter((genre) => !state.shownGenreKeys.includes(genre));
      const batch = remaining.slice(state.genreIndex, state.genreIndex + (BATCH_SIZE - sections.length));

      for (const genre of batch) {
        const section = await buildGenreSection(genre, context);
        state.shownGenreKeys.push(genre);
        if (!section || state.shownSectionIds.includes(section.id)) continue;
        sections.push(section);
        state.shownSectionIds.push(section.id);
      }

      state.genreIndex += batch.length;
      if (state.genreIndex >= remaining.length) {
        state.phase = 'trending';
        state.genreIndex = 0;
      }
    } else if (state.phase === 'trending') {
      const pending = TRENDING_SECTION_SPECS.filter(
        (spec) => !state.shownSectionIds.includes(spec.id)
      );

      for (const spec of pending) {
        if (sections.length >= BATCH_SIZE) break;
        const section = await buildOnlineSection(
          spec.id,
          spec.titleKey,
          spec.subtitleKey,
          spec.kind,
          context
        );
        state.shownSectionIds.push(spec.id);
        if (!section) continue;
        sections.push(section);
      }

      if (pending.every((spec) => state.shownSectionIds.includes(spec.id))) {
        state.phase = 'remainingGenres';
        state.genreIndex = 0;
      }
    } else if (state.phase === 'remainingGenres') {
      const remaining = DISCOVER_GENRES.filter((genre) => !state.shownGenreKeys.includes(genre));
      const batch = remaining.slice(state.genreIndex, state.genreIndex + (BATCH_SIZE - sections.length));

      for (const genre of batch) {
        const section = await buildGenreSection(genre, context);
        state.shownGenreKeys.push(genre);
        if (!section || state.shownSectionIds.includes(section.id)) continue;
        sections.push(section);
        state.shownSectionIds.push(section.id);
      }

      state.genreIndex += batch.length;
      if (state.genreIndex >= remaining.length) {
        return { sections, nextCursor: null };
      }
    }

    if (sections.length > beforeCount) continue;
    if (state.phase !== beforePhase) continue;
    break;
  }

  const remainingGenresLeft = DISCOVER_GENRES.some((genre) => !state.shownGenreKeys.includes(genre));
  if (state.phase === 'remainingGenres' && !remainingGenresLeft) {
    return { sections, nextCursor: null };
  }

  return { sections, nextCursor: state };
}
