import { createStore } from '../../lib/createStore';
import type { PrismRoute } from './libraryRouterTypes';
import { getCurrentRoute } from './libraryRouterStore';
import { libraryStore, setLibraryQuery } from './libraryStore';

interface SearchOverlayState {
  open: boolean;
  returnRoute: PrismRoute | null;
  query: string;
  savedPageQuery: string;
}

export const searchOverlayStore = createStore<SearchOverlayState>({
  open: false,
  returnRoute: null,
  query: '',
  savedPageQuery: '',
});

export function isSearchOverlayOpen(): boolean {
  return searchOverlayStore.getState().open;
}

export function getGlobalSearchQuery(): string {
  return searchOverlayStore.getState().query;
}

export function setGlobalSearchQuery(query: string): void {
  searchOverlayStore.patch({ query });
}

export function openSearchOverlay(initialQuery?: string): void {
  const current = getCurrentRoute();
  const state = searchOverlayStore.getState();
  const pageQuery = libraryStore.getState().query;

  if (!state.open) {
    searchOverlayStore.patch({
      open: true,
      returnRoute: current,
      savedPageQuery: pageQuery,
      query: initialQuery ?? pageQuery,
    });
    if (pageQuery.trim()) setLibraryQuery('');
  } else if (initialQuery !== undefined) {
    searchOverlayStore.patch({ query: initialQuery });
  } else {
    searchOverlayStore.patch({ open: true });
  }
}

export function closeSearchOverlay(): void {
  const { savedPageQuery } = searchOverlayStore.getState();
  searchOverlayStore.patch({
    open: false,
    returnRoute: null,
    query: '',
    savedPageQuery: '',
  });
  setLibraryQuery(savedPageQuery);
}
