import type { SubtitleTrack } from '../../../shared/subtitleTypes';

/** Stable per-file identity — matches Rust `media_id_for_path` / library `MediaItem.id`. */
export function makeVideoKey(mediaId: string): string {
  return mediaId;
}

export function filterTracksForVideo(
  tracks: SubtitleTrack[],
  videoKey: string | null | undefined
): SubtitleTrack[] {
  if (!videoKey) return [];
  return tracks.filter((track) => track.videoKey === videoKey);
}

export function isTrackForVideo(
  track: SubtitleTrack,
  videoKey: string,
  videoPath?: string | null
): boolean {
  if (track.videoKey !== videoKey) return false;
  if (videoPath && track.videoPath && track.videoPath !== videoPath) return false;
  return true;
}

export function findTrackForVideo(
  tracks: SubtitleTrack[],
  trackId: string | null,
  videoKey: string | null | undefined,
  videoPath?: string | null
): SubtitleTrack | null {
  if (!trackId || !videoKey) return null;
  const track = tracks.find((tr) => tr.id === trackId) ?? null;
  if (!track) return null;
  if (!isTrackForVideo(track, videoKey, videoPath)) {
    console.warn('[Virelia subtitles] stale selected subtitle ignored', {
      currentVideoKey: videoKey,
      currentVideoPath: videoPath,
      selectedTrackVideoKey: track.videoKey,
      selectedTrackVideoPath: track.videoPath,
      selectedTrackId: track.id,
      selectedTrackLabel: track.label,
    });
    return null;
  }
  return track;
}

export function partitionTracksBySource(tracks: SubtitleTrack[]) {
  return {
    embedded: tracks.filter((tr) => tr.source === 'embedded'),
    external: tracks.filter((tr) => tr.source === 'external'),
    generated: tracks.filter((tr) => tr.source === 'generated'),
  };
}
