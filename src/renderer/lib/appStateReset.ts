import {
  MINI_PLAYER_MODE_KEY,
  PLAYBACK_SESSION_KEY,
  clearPlaybackSession
} from './playbackPersistence';
import { PLAYBACK_PREVIEW_COLLAPSED_KEY } from '../playback/mediaPersistence';

/** App-local keys safe to clear without wiping the indexed media library. */
export const APP_STATE_STORAGE_KEYS = [
  PLAYBACK_SESSION_KEY,
  MINI_PLAYER_MODE_KEY,
  PLAYBACK_PREVIEW_COLLAPSED_KEY,
  'virelia.queue',
  'virelia.history',
  'virelia.playedAt',
  'virelia.favoriteIds',
  'virelia.playlists',
  'virelia.heroDismissed',
  'virelia.libraryFilter',
  'virelia.librarySort'
] as const;

export function resetAppLocalState(): void {
  for (const key of APP_STATE_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  clearPlaybackSession();
}
