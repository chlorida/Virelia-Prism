import { demoMedia } from '../../shared/defaults';
import type { MediaItem } from '../../shared/types';
import { shouldIncludeInLibrary } from '../../shared/mediaFileFilter';

/** Dev-only demo seed (`VITE_SHOW_DEMO_LIBRARY=true`). Off by default in Tauri/production. */
export function isDemoLibraryEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_SHOW_DEMO_LIBRARY === 'true';
}

/**
 * Bootstrap library list when settings have no folders yet.
 * Real scans always pass `scannedMedia` when `libraryFolders.length > 0`.
 */
export function resolveBootstrapLibrary(
  libraryFolders: string[],
  scannedMedia: MediaItem[]
): MediaItem[] {
  if (libraryFolders.length > 0) {
    return scannedMedia;
  }
  if (isDemoLibraryEnabled()) {
    return demoMedia;
  }
  return [];
}

/** Drop placeholder demo rows (empty filePath) unless demo mode is on. */
export function filterLibraryForShell(items: MediaItem[]): MediaItem[] {
  if (isDemoLibraryEnabled()) return items;
  return items.filter(
    (item) => {
      const filePath = item.filePath?.trim();
      if (!filePath) return false;
      const fileName = item.fileName?.trim() || filePath.split(/[\\/]/).pop() || filePath;
      return shouldIncludeInLibrary(filePath, fileName);
    },
  );
}
