import type { MediaItem, MediaFilter, SearchOptions, SortMode } from '../../shared/types';
import { buildSearchText } from './mediaIndex';
import { matchesSearchTokens } from './searchNormalize';

export interface FilteredMediaResult {
  items: MediaItem[];
  totalMatches: number;
  /** @deprecated Always false — full list is virtualized in the files table. */
  capped: boolean;
}

export interface ExtendedSearchOptions extends SearchOptions {
  favoriteIds?: Set<string>;
  playedAtById?: Record<string, string>;
  /** Pre-sorted by duration desc; used for fast-path when sort is duration and query is empty. */
  durationSorted?: MediaItem[];
}

function matchesFilter(item: MediaItem, filter: MediaFilter, options: ExtendedSearchOptions): boolean {
  if (filter === 'audio') return item.kind === 'audio';
  if (filter === 'video') return item.kind === 'video';
  if (filter === 'favorites') return Boolean(options.favoriteIds?.has(item.id) || item.favorite);
  if (filter === 'recent') return Boolean(item.lastPlayedAt || options.playedAtById?.[item.id]);
  return true;
}

function matchesQuery(item: MediaItem, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = item.searchText ?? buildSearchText(item);
  return matchesSearchTokens(haystack, query);
}

function compareItems(left: MediaItem, right: MediaItem, sort: SortMode, playedAtById?: Record<string, string>): number {
  if (sort === 'duration') {
    return (right.durationSeconds ?? 0) - (left.durationSeconds ?? 0);
  }
  if (sort === 'folder') {
    return left.folder.localeCompare(right.folder) || left.title.localeCompare(right.title);
  }
  if (sort === 'recent') {
    const leftPlayed = left.lastPlayedAt ?? playedAtById?.[left.id] ?? left.addedAt;
    const rightPlayed = right.lastPlayedAt ?? playedAtById?.[right.id] ?? right.addedAt;
    const leftTime = Date.parse(leftPlayed);
    const rightTime = Date.parse(rightPlayed);
    if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0;
    if (!Number.isFinite(leftTime)) return 1;
    if (!Number.isFinite(rightTime)) return -1;
    return rightTime - leftTime;
  }
  return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
}

function canUseSortedSlice(options: ExtendedSearchOptions, query: string): boolean {
  if (query.length > 0 || options.sort !== 'alphabetical') return false;
  if (options.filter === 'favorites' || options.filter === 'recent') return false;
  return options.filter === 'all' || options.filter === 'audio' || options.filter === 'video';
}

function canUseDurationSlice(options: ExtendedSearchOptions, query: string): boolean {
  if (query.length > 0 || options.sort !== 'duration') return false;
  if (options.filter === 'favorites' || options.filter === 'recent') return false;
  return Boolean(options.durationSorted?.length);
}

function filterSource(
  source: MediaItem[],
  options: ExtendedSearchOptions,
  query: string
): FilteredMediaResult {
  const matched: MediaItem[] = [];

  for (const item of source) {
    if (!matchesFilter(item, options.filter, options)) continue;
    if (!matchesQuery(item, query)) continue;
    matched.push(item);
  }

  return {
    items: matched,
    totalMatches: matched.length,
    capped: false,
  };
}

export function filterAndSortMedia(items: MediaItem[], options: ExtendedSearchOptions): FilteredMediaResult {
  const query = options.query.trim().toLocaleLowerCase();

  if (canUseSortedSlice(options, query)) {
    return {
      items,
      totalMatches: items.length,
      capped: false,
    };
  }

  if (canUseDurationSlice(options, query) && options.durationSorted) {
    return filterSource(options.durationSorted, options, query);
  }

  const matched: MediaItem[] = [];

  for (const item of items) {
    if (!matchesFilter(item, options.filter, options)) continue;
    if (!matchesQuery(item, query)) continue;
    matched.push(item);
  }

  if (matched.length > 1) {
    matched.sort((left, right) => compareItems(left, right, options.sort, options.playedAtById));
  }

  return {
    items: matched,
    totalMatches: matched.length,
    capped: false,
  };
}

export function sortMediaByTitle(items: MediaItem[]): MediaItem[] {
  if (items.length < 2) return items;
  return items.slice().sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }));
}

export function formatDuration(totalSeconds?: number): string {
  if (totalSeconds === undefined || totalSeconds === null || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '--:--';
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
