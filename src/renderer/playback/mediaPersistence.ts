export {
  PLAYBACK_SESSION_KEY,
  clearPlaybackSession,
  loadPlaybackSession,
  resolveRestorePosition,
  savePlaybackSession,
  type PlaybackSession,
  type SavePlaybackSessionInput
} from '../lib/playbackPersistence';

export const PLAYBACK_PREVIEW_COLLAPSED_KEY = 'virelia.previewCollapsed';

export function loadPreviewCollapsed(): boolean {
  try {
    return localStorage.getItem(PLAYBACK_PREVIEW_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function savePreviewCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(PLAYBACK_PREVIEW_COLLAPSED_KEY, collapsed ? 'true' : 'false');
  } catch {
    // ignore
  }
}
