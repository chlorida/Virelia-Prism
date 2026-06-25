import type { MediaItem } from '../../shared/types';

export interface LibraryCounts {
  all: number;
  audio: number;
  video: number;
  favorites: number;
  recent: number;
}

export function computeLibraryCounts(
  media: MediaItem[],
  playedAtById: Record<string, string> = {}
): LibraryCounts {
  let audio = 0;
  let video = 0;
  let favorites = 0;
  let recent = 0;

  for (const item of media) {
    if (item.kind === 'audio') audio += 1;
    else video += 1;
    if (item.favorite) favorites += 1;
    if (item.lastPlayedAt || playedAtById[item.id]) recent += 1;
  }

  return {
    all: media.length,
    audio,
    video,
    favorites,
    recent
  };
}
