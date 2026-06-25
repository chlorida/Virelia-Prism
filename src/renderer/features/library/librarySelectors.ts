import type { MediaItem, MediaFilter, Playlist, SortMode } from '../../../shared/types';
import { computeLibraryCounts, type LibraryCounts } from '../../lib/libraryStats';
import { filterAndSortMedia, type FilteredMediaResult } from '../../lib/search';
import { resolveSmartPlaylistMediaIds } from '../../lib/smartPlaylists';
import type { LibraryState } from './libraryTypes';

export interface LibraryDerivedInput {
  debouncedQuery: string;
  deferredQuery: string;
  activePlaylistId: string | null;
  playlists: Playlist[];
  favoriteIds: Set<string>;
  playedAtById: Record<string, string>;
}

export function selectPlaylistSource(
  media: MediaItem[],
  input: Pick<LibraryDerivedInput, 'activePlaylistId' | 'playlists' | 'favoriteIds' | 'playedAtById'>,
  durationById: Record<string, number>
): MediaItem[] | undefined {
  if (!input.activePlaylistId) return undefined;
  const playlist = input.playlists.find((item) => item.id === input.activePlaylistId);
  if (!playlist) return undefined;
  const ids = playlist.smart
    ? resolveSmartPlaylistMediaIds(playlist.smart, media, input.favoriteIds, input.playedAtById, durationById)
    : playlist.mediaIds;
  const idSet = new Set(ids);
  return media.filter((item) => idSet.has(item.id));
}

export function resolveFavoriteMedia(
  favoriteIds: Set<string>,
  mediaById: Map<string, MediaItem>
): MediaItem[] {
  const items: MediaItem[] = [];
  for (const id of favoriteIds) {
    const item = mediaById.get(id);
    if (item) items.push(item);
  }
  return items;
}

export function selectListSource(
  state: Pick<LibraryState, 'media' | 'audioMedia' | 'videoMedia' | 'filter'>,
  input: Pick<LibraryDerivedInput, 'debouncedQuery' | 'activePlaylistId'>,
  playlistSource?: MediaItem[],
  options?: { favoriteIds?: Set<string>; mediaById?: Map<string, MediaItem> }
): MediaItem[] {
  if (playlistSource) return playlistSource;
  if (input.debouncedQuery.trim()) return state.media;
  if (state.filter === 'favorites' && options?.favoriteIds && options.mediaById) {
    return resolveFavoriteMedia(options.favoriteIds, options.mediaById);
  }
  if (state.filter === 'audio') return state.audioMedia;
  if (state.filter === 'video') return state.videoMedia;
  return state.media;
}

export function selectFilteredMedia(
  listSource: MediaItem[],
  state: Pick<LibraryState, 'filter' | 'sort' | 'mediaDurationSorted'>,
  input: Pick<LibraryDerivedInput, 'deferredQuery' | 'activePlaylistId' | 'favoriteIds' | 'playedAtById'>
): FilteredMediaResult {
  return filterAndSortMedia(listSource, {
    query: input.deferredQuery,
    filter: input.activePlaylistId ? 'all' : state.filter,
    sort: state.sort,
    favoriteIds: input.favoriteIds,
    playedAtById: input.playedAtById,
    durationSorted: state.mediaDurationSorted
  });
}

export function selectVisibleMedia(
  filtered: FilteredMediaResult,
  favoriteIds: Set<string>,
  playedAtById: Record<string, string>
): MediaItem[] {
  return filtered.items.map((item) => ({
    ...item,
    favorite: favoriteIds.has(item.id) || item.favorite,
    lastPlayedAt: playedAtById[item.id] ?? item.lastPlayedAt
  }));
}

export function selectLibraryCounts(
  media: MediaItem[],
  favoriteIds: Set<string>,
  playedAtById: Record<string, string>
): LibraryCounts {
  return {
    ...computeLibraryCounts(media, playedAtById),
    favorites: favoriteIds.size
  };
}

export type LibraryCountsView = LibraryCounts & {
  pending: boolean;
};

export function selectEffectiveLibraryCounts(
  state: Pick<import('./libraryTypes').LibraryState, 'media' | 'snapshotCounts' | 'scanning' | 'countsPending'>,
  favoriteIds: Set<string>,
  playedAtById: Record<string, string>
): LibraryCountsView {
  const live = selectLibraryCounts(state.media, favoriteIds, playedAtById);
  if (state.media.length > 0 && !state.scanning) {
    return { ...live, pending: false };
  }
  if (state.snapshotCounts && state.scanning) {
    return {
      ...state.snapshotCounts,
      favorites: live.favorites,
      recent: live.recent,
      pending: Boolean(state.countsPending),
    };
  }
  if (state.snapshotCounts) {
    return {
      ...state.snapshotCounts,
      favorites: live.favorites,
      recent: live.recent,
      pending: Boolean(state.countsPending && state.scanning),
    };
  }
  if (state.media.length > 0) {
    return { ...live, pending: false };
  }
  return { ...live, pending: Boolean(state.countsPending) };
}

export function selectMediaById(media: MediaItem[]): Map<string, MediaItem> {
  return new Map(media.map((item) => [item.id, item]));
}
