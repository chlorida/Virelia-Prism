import type { MediaItem } from '../../shared/types';

type MediaSessionHandlers = {
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

export function syncMediaSession(
  media: MediaItem | undefined,
  playing: boolean,
  handlers: MediaSessionHandlers
): void {
  if (!('mediaSession' in navigator)) return;

  if (!media?.filePath) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
    navigator.mediaSession.setActionHandler('previoustrack', null);
    navigator.mediaSession.setActionHandler('nexttrack', null);
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: media.title,
    artist: media.artist ?? media.fileName,
    album: media.album ?? 'Virelia Prism'
  });

  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';

  navigator.mediaSession.setActionHandler('play', handlers.onPlay);
  navigator.mediaSession.setActionHandler('pause', handlers.onPause);
  navigator.mediaSession.setActionHandler('previoustrack', handlers.onPrevious);
  navigator.mediaSession.setActionHandler('nexttrack', handlers.onNext);
}
