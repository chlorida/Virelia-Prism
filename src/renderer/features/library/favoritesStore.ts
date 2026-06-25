import { createStore } from '../../lib/createStore';
import { readStored, STORAGE_KEYS, writeStored } from '../../lib/storageKeys';
import type { MediaItem } from '../../../shared/types';

interface FavoritesState {
  favoriteIds: Set<string>;
}

export const favoritesStore = createStore<FavoritesState>({
  favoriteIds: new Set(readStored<string[]>(STORAGE_KEYS.favorites, []))
});

favoritesStore.subscribe((state) => {
  writeStored(STORAGE_KEYS.favorites, [...state.favoriteIds]);
});

export function toggleFavoriteId(mediaId: string): void {
  favoritesStore.setState((state) => {
    const next = new Set(state.favoriteIds);
    if (next.has(mediaId)) next.delete(mediaId);
    else next.add(mediaId);
    return { favoriteIds: next };
  });
}

export function toggleFavoriteItem(item: MediaItem): void {
  toggleFavoriteId(item.id);
}
