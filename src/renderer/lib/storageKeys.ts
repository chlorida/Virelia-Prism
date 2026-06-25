export const STORAGE_KEYS = {
  favorites: 'virelia.favoriteIds',
  playedAt: 'virelia.playedAt',
  history: 'virelia.history',
  queue: 'virelia.queue',
  playlists: 'virelia.playlists',
  libraryFilter: 'virelia.libraryFilter',
  librarySort: 'virelia.librarySort',
  libraryViewMode: 'virelia.libraryViewMode',
  contentMode: 'virelia.contentMode',
  heroDismissed: 'virelia.heroDismissed',
  sidebarCollapsed: 'virelia.sidebarCollapsed',
  rightPanelTabsExpanded: 'virelia.rightPanelTabsExpanded',
} as const;

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}
