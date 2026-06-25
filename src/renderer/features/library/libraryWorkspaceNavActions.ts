import type { LibrarySecondary, WorkspacePrimary } from '../../components/library/LibraryWorkspaceNav';
import { readStored, STORAGE_KEYS, writeStored } from '../../lib/storageKeys';
import { playUiSound } from '../../services/uiAudioService';
import type { PrismRoute } from './libraryRouterTypes';
import {
  navigateToDiscover,
  navigateToFilesView,
  navigateToLibraryHome,
  navigateToWatchlist,
} from './libraryRouterStore';

export function workspacePrimaryFromRoute(route: PrismRoute): WorkspacePrimary {
  switch (route.page) {
    case 'discover':
      return 'discover';
    case 'watchlist':
      return 'watchlist';
    default:
      return 'library';
  }
}

export function librarySecondaryFromRoute(route: PrismRoute): LibrarySecondary {
  return route.page === 'files' ? 'files' : 'titles';
}

export function changeWorkspacePrimary(tab: WorkspacePrimary): void {
  playUiSound('open');
  switch (tab) {
    case 'library':
      writeStored(STORAGE_KEYS.libraryViewMode, 'titles');
      navigateToLibraryHome();
      break;
    case 'discover':
      navigateToDiscover();
      break;
    case 'watchlist':
      navigateToWatchlist();
      break;
  }
}

export function changeLibrarySecondary(tab: LibrarySecondary): void {
  playUiSound('open');
  writeStored(STORAGE_KEYS.libraryViewMode, tab);
  if (tab === 'files') {
    navigateToFilesView();
  } else {
    navigateToLibraryHome();
  }
}

export function readLibraryViewModePreference(): LibrarySecondary {
  const stored = readStored<'titles' | 'files'>(STORAGE_KEYS.libraryViewMode, 'titles');
  return stored === 'files' ? 'files' : 'titles';
}
