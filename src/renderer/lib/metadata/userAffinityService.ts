import type { LibraryTitle } from '../mediaIntelligence/types';
import type { MediaItem } from '../../../shared/types';
import { findLibraryTitleByMediaId } from '../mediaIntelligence/libraryTitleService';

export interface UserAffinityProfile {
  genreWeights: Record<string, number>;
  titleWeights: Map<string, number>;
  franchiseWeights: Map<string, number>;
  isColdStart: boolean;
}

type TitleWithGenres = LibraryTitle & { genres?: string[] };

const WATCHLIST_WEIGHT = 1.0;
const FAVORITE_WEIGHT = 0.8;
const HALF_LIFE_DAYS = 30;

function recencyMultiplier(isoDate?: string): number {
  if (!isoDate) return 1;
  const days = (Date.now() - new Date(isoDate).getTime()) / 86_400_000;
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

function titleGenres(title: LibraryTitle): string[] {
  return (title as TitleWithGenres).genres ?? [];
}

export function buildUserAffinityProfile(input: {
  libraryTitles: LibraryTitle[];
  mediaItems: MediaItem[];
  favoriteIds: Set<string>;
  watchlistCatalogIds: string[];
}): UserAffinityProfile {
  const genreScores = new Map<string, number>();
  const titleWeights = new Map<string, number>();
  const franchiseWeights = new Map<string, number>();
  let hasMeaningfulWatchData = false;

  for (const media of input.mediaItems) {
    if (media.kind !== 'video') continue;
    const progress = media.resumePositionSeconds ?? 0;
    const duration = media.durationSeconds ?? 0;
    if (progress < 30 || duration <= 0) continue;
    const watchRatio = Math.min(1, progress / duration);
    const weight = watchRatio * recencyMultiplier(media.addedAt);
    const title = findLibraryTitleByMediaId(input.libraryTitles, media.id);
    if (!title) continue;

    hasMeaningfulWatchData = true;
    titleWeights.set(title.id, (titleWeights.get(title.id) ?? 0) + weight);
    if (title.franchiseId) {
      franchiseWeights.set(
        title.franchiseId,
        (franchiseWeights.get(title.franchiseId) ?? 0) + weight
      );
    }
    for (const genre of titleGenres(title)) {
      const key = genre.trim();
      if (!key) continue;
      genreScores.set(key, (genreScores.get(key) ?? 0) + weight);
    }
  }

  for (const catalogId of input.watchlistCatalogIds) {
    titleWeights.set(catalogId, (titleWeights.get(catalogId) ?? 0) + WATCHLIST_WEIGHT);
  }

  for (const favId of input.favoriteIds) {
    const title = findLibraryTitleByMediaId(input.libraryTitles, favId);
    if (title) {
      titleWeights.set(title.id, (titleWeights.get(title.id) ?? 0) + FAVORITE_WEIGHT);
    }
  }

  const genreTotal = [...genreScores.values()].reduce((a, b) => a + b, 0) || 1;
  const genreWeights: Record<string, number> = {};
  for (const [genre, score] of genreScores) {
    genreWeights[genre] = score / genreTotal;
  }

  return {
    genreWeights,
    titleWeights,
    franchiseWeights,
    isColdStart:
      !hasMeaningfulWatchData
      && input.watchlistCatalogIds.length === 0
      && input.favoriteIds.size === 0,
  };
}
