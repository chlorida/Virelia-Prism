import { useMemo } from 'react';
import type { MediaItem } from '../../../shared/types';
import { resolveHistoryMedia } from '../../lib/playbackHistory';
import { useStore } from '../../lib/useStore';
import { favoritesStore } from './favoritesStore';
import { historyStore } from './historyStore';
import {
  selectEffectiveLibraryCounts,
  selectFilteredMedia,
  selectListSource,
  selectMediaById,
  selectPlaylistSource,
  selectVisibleMedia,
} from './librarySelectors';
import { libraryStore } from './libraryStore';
import { queueStore } from '../queue/queueStore';

const EMPTY_MAP = new Map<string, MediaItem>();

export function useLibraryDerived(debouncedQuery: string, deferredQuery: string) {
  const media = useStore(libraryStore, (state) => state.media);
  const audioMedia = useStore(libraryStore, (state) => state.audioMedia);
  const videoMedia = useStore(libraryStore, (state) => state.videoMedia);
  const filter = useStore(libraryStore, (state) => state.filter);
  const sort = useStore(libraryStore, (state) => state.sort);
  const durationById = useStore(libraryStore, (state) => state.durationById);
  const mediaDurationSorted = useStore(libraryStore, (state) => state.mediaDurationSorted);
  const snapshotCounts = useStore(libraryStore, (state) => state.snapshotCounts);
  const scanning = useStore(libraryStore, (state) => state.scanning);
  const countsPending = useStore(libraryStore, (state) => state.countsPending);

  const favoriteIds = useStore(favoritesStore, (state) => state.favoriteIds);
  const playedAtById = useStore(historyStore, (state) => state.playedAtById);
  const playbackHistory = useStore(historyStore, (state) => state.playbackHistory);
  const playlists = useStore(queueStore, (state) => state.playlists);
  const activePlaylistId = useStore(queueStore, (state) => state.activePlaylistId);

  const librarySlice = useMemo(
    () => ({
      media,
      audioMedia,
      videoMedia,
      filter,
      sort,
      mediaDurationSorted,
      snapshotCounts,
      scanning,
      countsPending,
      durationById,
    }),
    [
      media,
      audioMedia,
      videoMedia,
      filter,
      sort,
      mediaDurationSorted,
      snapshotCounts,
      scanning,
      countsPending,
      durationById,
    ],
  );

  const derivedInput = useMemo(
    () => ({
      debouncedQuery,
      deferredQuery,
      activePlaylistId,
      playlists,
      favoriteIds,
      playedAtById,
    }),
    [debouncedQuery, deferredQuery, activePlaylistId, playlists, favoriteIds, playedAtById],
  );

  const needsMediaById =
    Boolean(activePlaylistId)
    || debouncedQuery.trim().length > 0
    || filter === 'favorites';

  const mediaById = useMemo(
    () => (needsMediaById ? selectMediaById(media) : EMPTY_MAP),
    [needsMediaById, media],
  );

  const playlistSource = useMemo(
    () => selectPlaylistSource(media, derivedInput, durationById),
    [media, derivedInput, durationById],
  );

  const listSource = useMemo(
    () =>
      selectListSource(librarySlice, derivedInput, playlistSource, {
        favoriteIds,
        mediaById,
      }),
    [librarySlice, derivedInput, playlistSource, favoriteIds, mediaById],
  );

  const filteredMedia = useMemo(
    () => selectFilteredMedia(listSource, librarySlice, derivedInput),
    [listSource, librarySlice, derivedInput],
  );

  const visibleMedia = useMemo(
    () => selectVisibleMedia(filteredMedia, favoriteIds, playedAtById),
    [filteredMedia, favoriteIds, playedAtById],
  );

  const counts = useMemo(
    () => selectEffectiveLibraryCounts(librarySlice, favoriteIds, playedAtById),
    [librarySlice, favoriteIds, playedAtById],
  );

  const historyItems = useMemo(
    () => resolveHistoryMedia(playbackHistory, media),
    [playbackHistory, media],
  );

  return {
    library: librarySlice,
    visibleMedia,
    filteredMedia,
    counts,
    mediaById: needsMediaById ? mediaById : EMPTY_MAP,
    historyItems,
    favoriteIds,
    playedAtById,
    playlists,
    activePlaylistId,
  };
}
