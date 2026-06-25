/** Internal Prism navigation routes (no URL reload). */
export type PrismRoute =
  | { page: 'home' }
  | { page: 'files' }
  | { page: 'search' }
  | { page: 'discover' }
  | { page: 'watchlist' }
  | { page: 'downloads' }
  | { page: 'franchise'; franchiseId: string }
  | { page: 'title'; localTitleId: string }
  | { page: 'catalog'; catalogTitleId: string; franchiseId?: string }
  | { page: 'catalog-season'; catalogTitleId: string; seasonNumber: number; franchiseId?: string }
  | { page: 'catalog-episode'; catalogTitleId: string; seasonNumber: number; episodeNumber: number; franchiseId?: string }
  | { page: 'person'; personId: string }
  | { page: 'studio'; studioId: string }
  | { page: 'provider'; providerId: string };

export type LibrarySurfacePage =
  | 'home'
  | 'search'
  | 'franchise'
  | 'title'
  | 'catalog'
  | 'discover'
  | 'watchlist'
  | 'downloads'
  | 'files';

export function routeToLibraryPage(route: PrismRoute, input: {
  viewMode: 'files' | 'titles';
  libraryMode: boolean;
  searchActive: boolean;
}): LibrarySurfacePage {
  if (!input.libraryMode || input.viewMode === 'files') return 'files';
  switch (route.page) {
    case 'title':
      return 'title';
    case 'franchise':
      return 'franchise';
    case 'catalog':
    case 'catalog-season':
    case 'catalog-episode':
      return 'catalog';
    case 'search':
      return 'search';
    case 'discover':
      return 'discover';
    case 'watchlist':
      return 'watchlist';
    case 'downloads':
      return 'downloads';
    case 'home':
    case 'files':
    default:
      return 'home';
  }
}

export function routesEqual(a: PrismRoute, b: PrismRoute): boolean {
  if (a.page !== b.page) return false;
  switch (a.page) {
    case 'franchise':
      return b.page === 'franchise' && a.franchiseId === b.franchiseId;
    case 'title':
      return b.page === 'title' && a.localTitleId === b.localTitleId;
    case 'catalog':
      return b.page === 'catalog' && a.catalogTitleId === b.catalogTitleId;
    case 'catalog-season':
      return b.page === 'catalog-season'
        && a.catalogTitleId === b.catalogTitleId
        && a.seasonNumber === b.seasonNumber;
    case 'catalog-episode':
      return b.page === 'catalog-episode'
        && a.catalogTitleId === b.catalogTitleId
        && a.seasonNumber === b.seasonNumber
        && a.episodeNumber === b.episodeNumber;
    case 'person':
      return b.page === 'person' && a.personId === b.personId;
    case 'studio':
      return b.page === 'studio' && a.studioId === b.studioId;
    case 'provider':
      return b.page === 'provider' && a.providerId === b.providerId;
    default:
      return true;
  }
}
