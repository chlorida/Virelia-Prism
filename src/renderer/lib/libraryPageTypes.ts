export type LibraryPage = 'home' | 'search' | 'franchise' | 'title' | 'catalog' | 'discover' | 'watchlist' | 'downloads' | 'files';

export function resolveLibraryPage(input: {
  libraryMode: boolean;
  viewMode: 'files' | 'titles';
  searchActive: boolean;
  routePage?: string;
  selectedFranchiseId?: string;
  selectedTitleId?: string;
}): LibraryPage {
  if (!input.libraryMode || input.viewMode === 'files') return 'files';
  if (input.routePage === 'discover') return 'discover';
  if (input.routePage === 'watchlist') return 'watchlist';
  if (input.routePage === 'downloads') return 'downloads';
  if (input.routePage === 'catalog' || input.routePage === 'catalog-season' || input.routePage === 'catalog-episode') {
    return 'catalog';
  }
  if (input.selectedTitleId || input.routePage === 'title') return 'title';
  if (input.selectedFranchiseId || input.routePage === 'franchise') return 'franchise';
  if (input.routePage === 'search') return 'search';
  return 'home';
}
