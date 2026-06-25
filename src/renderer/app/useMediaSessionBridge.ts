import { useEffect } from 'react';
import type { MediaItem } from '../../shared/types';
import { syncMediaSession } from '../lib/mediaSession';

export function useMediaSessionBridge(options: {
  currentMedia?: MediaItem;
  sessionPlaying: boolean;
  onTogglePlayback: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    syncMediaSession(options.currentMedia, options.sessionPlaying, {
      onPlay: options.onTogglePlayback,
      onPause: options.onTogglePlayback,
      onPrevious: options.onPrevious,
      onNext: options.onNext
    });
  }, [options.currentMedia, options.sessionPlaying, options.onTogglePlayback, options.onPrevious, options.onNext]);
}
