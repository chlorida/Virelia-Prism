import { createStore } from '../../lib/createStore';
import { readStored, writeStored } from '../../lib/storageKeys';
import type { CatalogMediaType } from '../../lib/metadata/types';
import { formatCatalogRef } from '../../lib/metadata/catalogRef';

export type WatchlistStatus = 'interested' | 'planning' | 'watching' | 'completed' | 'dropped';

export interface WatchlistItem {
  id: string;
  provider: string;
  providerId: string;
  title: string;
  originalTitle?: string;
  year?: number;
  type: CatalogMediaType;
  posterUrl?: string;
  addedAt: string;
  note?: string;
  status: WatchlistStatus;
}

const STORAGE_KEY = 'virelia.watchlist';

interface WatchlistState {
  items: WatchlistItem[];
}

function loadItems(): WatchlistItem[] {
  return readStored<WatchlistItem[]>(STORAGE_KEY, []);
}

export const watchlistStore = createStore<WatchlistState>({
  items: loadItems(),
});

function persist(items: WatchlistItem[]): void {
  writeStored(STORAGE_KEY, items);
  watchlistStore.patch({ items });
}

export function isInWatchlist(catalogRef: string): boolean {
  return watchlistStore.getState().items.some((item) => item.id === catalogRef);
}

export function addToWatchlist(input: Omit<WatchlistItem, 'id' | 'addedAt' | 'status'> & {
  status?: WatchlistStatus;
}): void {
  const id = formatCatalogRef(input.provider, input.providerId);
  const existing = watchlistStore.getState().items.find((item) => item.id === id);
  if (existing) return;
  const next: WatchlistItem = {
    ...input,
    id,
    addedAt: new Date().toISOString(),
    status: input.status ?? 'interested',
  };
  persist([next, ...watchlistStore.getState().items]);
}

export function removeFromWatchlist(catalogRef: string): void {
  persist(watchlistStore.getState().items.filter((item) => item.id !== catalogRef));
}

export function updateWatchlistStatus(catalogRef: string, status: WatchlistStatus): void {
  persist(
    watchlistStore.getState().items.map((item) =>
      item.id === catalogRef ? { ...item, status } : item
    )
  );
}

export function clearWatchlist(): void {
  persist([]);
}
