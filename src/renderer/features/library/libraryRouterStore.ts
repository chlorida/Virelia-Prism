import { createStore } from '../../lib/createStore';
import {
  libraryStore,
  setLibraryQuery,
  setLibrarySelectedFranchiseId,
  setLibrarySelectedTitleId,
} from './libraryStore';
import { routesEqual, type PrismRoute } from './libraryRouterTypes';
import { openSearchOverlay, setGlobalSearchQuery } from './searchOverlayStore';
import { resetLibraryMainScroll } from './libraryScrollReset';

interface LibraryRouterState {
  route: PrismRoute;
  backStack: PrismRoute[];
}

export const libraryRouterStore = createStore<LibraryRouterState>({
  route: { page: 'home' },
  backStack: [],
});

function syncLegacyLibrarySelection(route: PrismRoute): void {
  switch (route.page) {
    case 'title':
      setLibrarySelectedTitleId(route.localTitleId);
      break;
    case 'franchise':
      setLibrarySelectedFranchiseId(route.franchiseId);
      break;
    case 'catalog':
    case 'catalog-season':
    case 'catalog-episode':
      setLibrarySelectedTitleId(undefined);
      setLibrarySelectedFranchiseId(route.franchiseId);
      break;
    case 'search':
      break;
    case 'home':
    case 'files':
    case 'discover':
    case 'watchlist':
    case 'downloads':
      setLibrarySelectedTitleId(undefined);
      setLibrarySelectedFranchiseId(undefined);
      break;
    default:
      setLibrarySelectedTitleId(undefined);
      break;
  }
}

export function getCurrentRoute(): PrismRoute {
  return libraryRouterStore.getState().route;
}

export function navigatePrismRoute(
  next: PrismRoute,
  options?: { replace?: boolean; skipHistory?: boolean }
): void {
  const { route, backStack } = libraryRouterStore.getState();
  if (routesEqual(route, next)) return;

  const nextStack = options?.replace
    ? backStack
    : options?.skipHistory
      ? backStack
      : [...backStack, route];

  libraryRouterStore.patch({ route: next, backStack: nextStack });
  syncLegacyLibrarySelection(next);
  resetLibraryMainScroll();

  if (next.page === 'search' && 'query' in next === false) {
    const query = libraryStore.getState().query;
    if (query.trim()) libraryRouterStore.patch({ route: { page: 'search' } });
  }
}

export function navigatePrismBack(): boolean {
  const { backStack } = libraryRouterStore.getState();
  if (backStack.length === 0) {
    navigatePrismRoute({ page: 'home' }, { replace: true, skipHistory: true });
    setLibraryQuery('');
    return false;
  }
  const previous = backStack[backStack.length - 1];
  libraryRouterStore.patch({
    route: previous,
    backStack: backStack.slice(0, -1),
  });
  syncLegacyLibrarySelection(previous);
  resetLibraryMainScroll();
  return true;
}

export function resetPrismNavigation(): void {
  libraryRouterStore.patch({ route: { page: 'home' }, backStack: [] });
  setLibrarySelectedTitleId(undefined);
  setLibrarySelectedFranchiseId(undefined);
}

export function navigateToLibraryHome(): void {
  setLibraryQuery('');
  navigatePrismRoute({ page: 'home' }, { replace: true });
  libraryRouterStore.patch({ backStack: [] });
}

export function navigateToFranchise(franchiseId: string): void {
  navigatePrismRoute({ page: 'franchise', franchiseId });
}

export function navigateToLocalTitle(localTitleId: string): void {
  navigatePrismRoute({ page: 'title', localTitleId });
}

export function navigateToCatalogTitle(catalogTitleId: string, franchiseId?: string): void {
  navigatePrismRoute({ page: 'catalog', catalogTitleId, franchiseId });
}

export function navigateToDiscover(): void {
  navigatePrismRoute({ page: 'discover' });
}

export function navigateToWatchlist(): void {
  navigatePrismRoute({ page: 'watchlist' });
}

export function navigateToDownloads(): void {
  navigatePrismRoute({ page: 'downloads' });
}

export function navigateToSearch(query: string): void {
  setGlobalSearchQuery(query);
  openSearchOverlay(query);
}

export function navigateToFilesView(): void {
  setLibraryQuery('');
  setLibrarySelectedTitleId(undefined);
  setLibrarySelectedFranchiseId(undefined);
  navigatePrismRoute({ page: 'files' }, { replace: true });
  libraryRouterStore.patch({ backStack: [] });
}
