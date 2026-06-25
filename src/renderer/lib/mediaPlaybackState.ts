const HAVE_FUTURE_DATA = typeof HTMLMediaElement !== 'undefined'
  ? HTMLMediaElement.HAVE_FUTURE_DATA
  : 3;

/** UI playback flags derived from the real HTML media element (source of truth). */
export interface MediaPlaybackUiState {
  positionSeconds: number;
  durationSeconds: number;
  isPlaying: boolean;
  isLoading: boolean;
}

export function deriveMediaPlaybackUi(
  element: HTMLMediaElement | null,
  hasTrack: boolean,
  rendererPlayback: boolean,
  fallbackPlaying: boolean
): MediaPlaybackUiState {
  if (!rendererPlayback) {
    return {
      positionSeconds: 0,
      durationSeconds: 0,
      isPlaying: Boolean(hasTrack && fallbackPlaying),
      isLoading: false
    };
  }

  const mediaReady = Boolean(hasTrack && element?.src);
  if (!mediaReady || !element) {
    return {
      positionSeconds: 0,
      durationSeconds: 0,
      isPlaying: false,
      isLoading: false
    };
  }

  const durationSeconds = Number.isFinite(element.duration) && element.duration > 0
    ? element.duration
    : 0;
  const isPaused = element.paused || element.ended;
  const isLoading = !isPaused && element.readyState < HAVE_FUTURE_DATA;
  const isPlaying = !isPaused && !isLoading;

  return {
    positionSeconds: element.currentTime,
    durationSeconds,
    isPlaying,
    isLoading
  };
}
