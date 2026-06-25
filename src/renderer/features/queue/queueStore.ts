import { demoPlaylists } from '../../../shared/defaults';
import type { MediaItem, Playlist, QueueItem } from '../../../shared/types';
import { createStore } from '../../lib/createStore';
import { pruneQueueToMedia } from '../../lib/mediaMetadata';
import { readStored, STORAGE_KEYS, writeStored } from '../../lib/storageKeys';

interface QueueState {
  queue: QueueItem[];
  playlists: Playlist[];
  activePlaylistId: string | null;
}

export const queueStore = createStore<QueueState>({
  queue: [],
  playlists: readStored(STORAGE_KEYS.playlists, demoPlaylists),
  activePlaylistId: null
});

queueStore.subscribe((state) => {
  writeStored(STORAGE_KEYS.queue, state.queue);
  writeStored(STORAGE_KEYS.playlists, state.playlists);
});

export function setQueueItems(queue: QueueItem[]): void {
  queueStore.patch({ queue });
}

export function pruneQueueAgainstMedia(media: MediaItem[]): void {
  queueStore.setState((state) => ({
    ...state,
    queue: pruneQueueToMedia(state.queue, media)
  }));
}

export function addMediaBatchToQueue(items: MediaItem[]): number {
  let added = 0;
  queueStore.setState((state) => {
    const existing = new Set(state.queue.map((q) => q.mediaId));
    const next = [...state.queue];
    for (const item of items) {
      if (existing.has(item.id)) continue;
      existing.add(item.id);
      added += 1;
      next.push({
        id: `queue-${item.id}-${Date.now()}-${added}`,
        mediaId: item.id,
        pinned: false,
        addedAt: new Date().toISOString(),
      });
    }
    if (added === 0) return state;
    return { ...state, queue: next };
  });
  return added;
}

export function addMediaToQueue(item: MediaItem): boolean {
  let added = false;
  queueStore.setState((state) => {
    if (state.queue.some((entry) => entry.mediaId === item.id)) return state;
    added = true;
    return {
      ...state,
      queue: [
        ...state.queue,
        {
          id: `queue-${item.id}-${Date.now()}`,
          mediaId: item.id,
          pinned: false,
          addedAt: new Date().toISOString()
        }
      ]
    };
  });
  return added;
}

export function removeQueueItem(queueId: string): void {
  queueStore.setState((state) => ({
    ...state,
    queue: state.queue.filter((item) => item.id !== queueId)
  }));
}

export function clearQueue(): void {
  queueStore.patch({ queue: [] });
}

export function reorderQueue(queue: QueueItem[]): void {
  queueStore.patch({ queue });
}

export function toggleQueuePin(queueId: string): void {
  queueStore.setState((state) => ({
    ...state,
    queue: state.queue.map((item) => (
      item.id === queueId ? { ...item, pinned: !item.pinned } : item
    ))
  }));
}

export function setActivePlaylistId(activePlaylistId: string | null): void {
  queueStore.patch({ activePlaylistId });
}

export function toggleActivePlaylist(playlistId: string): void {
  queueStore.setState((state) => ({
    ...state,
    activePlaylistId: state.activePlaylistId === playlistId ? null : playlistId
  }));
}

export function createPlaylist(name: string): void {
  queueStore.setState((state) => ({
    ...state,
    playlists: [...state.playlists, { id: `playlist-${Date.now()}`, name, mediaIds: [] }]
  }));
}

export function renamePlaylist(playlistId: string, name: string): void {
  queueStore.setState((state) => ({
    ...state,
    playlists: state.playlists.map((item) => (
      item.id === playlistId ? { ...item, name } : item
    ))
  }));
}

export function addToPlaylist(playlistId: string, mediaId: string): void {
  queueStore.setState((state) => ({
    ...state,
    playlists: state.playlists.map((playlist) => (
      playlist.id === playlistId && !playlist.smart
        ? {
            ...playlist,
            mediaIds: playlist.mediaIds.includes(mediaId)
              ? playlist.mediaIds
              : [...playlist.mediaIds, mediaId]
          }
        : playlist
    ))
  }));
}
