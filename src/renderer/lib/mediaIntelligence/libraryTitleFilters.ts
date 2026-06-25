import type { MediaItem } from '../../../shared/types';
import type { ContentMode } from '../../features/content/contentModeTypes';
import type { LibraryTitle } from './types';
import { isAudioOnlyLibraryTitle } from './audioAlbumService';
import { hasExplicitEpisodeMarker, normalizeSeriesKey } from './episodeParser';
import { getCachedParsedIdentity } from './mediaIdentityCache';
import { getNumberedEpisodeCount } from './titleDisplayUtils';

const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}/;
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u;

const GENERIC_SINGLE_WORDS = new Set([
  'group',
  'valve',
  'showcase',
  'video',
  'audio',
  'test',
  'clip',
  'draft',
  'temp',
  'sample',
  'file',
  'movie',
  'untitled',
]);

const ASSET_KEYWORDS = [
  'фон',
  'обои',
  'заставка',
  'wallpaper',
  'background',
  'screensaver',
  'texture',
  'sprite',
];

/** Screen capture / asset names that must never become library titles. */
export function looksLikeRecordingOrAssetTitle(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (ISO_DATE_RE.test(trimmed)) return true;
  if (EMOJI_RE.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  if (ASSET_KEYWORDS.some((keyword) => lower.includes(keyword))) return true;
  return false;
}

/** Raw filename stems that must never appear as library titles. */
export function looksLikeGenericFileStem(name: string): boolean {
  const stem = name.replace(/\.[^.]+$/, '').trim();
  if (!stem) return true;
  if (looksLikeRecordingOrAssetTitle(stem)) return true;

  if (/^\d{1,4}(\(\d+\))?$/.test(stem)) return true;
  if (/^\d{3,4}\s*\(\d+\)$/.test(stem)) return true;
  if (/^\d{1,2}\s+\S+$/.test(stem) && stem.length <= 16) return true;
  if (/^\d{3,4}-\d{3,4}$/.test(stem)) return true;
  if (/^[\d._\-()]+$/.test(stem) && stem.length <= 12) return true;
  if (stem.length <= 3 && !/[a-zA-Z\u0400-\u04FF]{3,}/.test(stem)) return true;
  if (GENERIC_SINGLE_WORDS.has(stem.toLowerCase())) return true;

  return false;
}

function titleNameCandidates(title: LibraryTitle): string[] {
  return [title.displayTitle, title.canonicalTitle, ...title.items.map((item) => item.fileName)]
    .filter((value): value is string => Boolean(value?.trim()));
}

function titleLooksLikeRecordingCollection(title: LibraryTitle): boolean {
  if (looksLikeRecordingOrAssetTitle(title.displayTitle)) return true;
  if (title.canonicalTitle && looksLikeRecordingOrAssetTitle(title.canonicalTitle)) return true;

  const datedFiles = title.items.filter((item) => ISO_DATE_RE.test(item.fileName)).length;
  if (datedFiles >= 2 && datedFiles / Math.max(1, title.items.length) >= 0.4) {
    return true;
  }

  const genericFiles = title.items.filter((item) => looksLikeGenericFileStem(item.fileName)).length;
  if (genericFiles >= 2 && genericFiles / Math.max(1, title.items.length) >= 0.6) {
    return true;
  }

  return false;
}

function seriesHasExplicitReleaseStructure(title: LibraryTitle): boolean {
  let explicit = 0;
  for (const item of title.items) {
    const parsed = getCachedParsedIdentity(item);
    if (hasExplicitEpisodeMarker(item.fileName, normalizeSeriesKey(parsed))) {
      explicit += 1;
    }
  }
  return explicit >= 2;
}

export function hasMeaningfulTitleName(title: LibraryTitle): boolean {
  const names = titleNameCandidates(title);
  if (names.length === 0) return false;
  if (names.every((name) => looksLikeGenericFileStem(name))) return false;
  if (names.some(looksLikeRecordingOrAssetTitle)) return false;

  const display = title.displayTitle.trim();
  const words = display.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && !looksLikeRecordingOrAssetTitle(display)) return true;
  if (title.franchiseId) return true;
  if (title.mediaType === 'movie' || title.mediaType === 'ova' || title.mediaType === 'special') {
    return true;
  }
  if (title.year != null && display.length >= 4) return true;
  if (GENERIC_SINGLE_WORDS.has(display.toLowerCase())) return false;

  return false;
}

/**
 * Titles shelf / discover surfaces: organized works only.
 * Loose files stay in the Files tab or open-from-explorer playback.
 */
export function isBrowsableLibraryTitle(title: LibraryTitle): boolean {
  if (titleLooksLikeRecordingCollection(title)) return false;
  if (!hasMeaningfulTitleName(title)) return false;

  const numbered = getNumberedEpisodeCount(title);

  if (title.mediaType === 'album') {
    return title.totalFileCount >= 2 || numbered >= 2;
  }

  if (title.mediaType === 'series') {
    if (!title.franchiseId && !seriesHasExplicitReleaseStructure(title)) return false;
    return numbered >= 2 || (numbered >= 1 && Boolean(title.franchiseId));
  }

  if (title.mediaType === 'movie' || title.mediaType === 'ova' || title.mediaType === 'special') {
    return true;
  }

  if (title.franchiseId && numbered >= 1) return true;

  return false;
}

export function filterBrowsableLibraryTitles(titles: LibraryTitle[]): LibraryTitle[] {
  return titles.filter(isBrowsableLibraryTitle);
}

export function isItemInBrowsableTitle(item: MediaItem, titles: LibraryTitle[]): boolean {
  return titles.some((title) => title.items.some((entry) => entry.id === item.id));
}

export function isMusicTitle(title: LibraryTitle): boolean {
  return isAudioOnlyLibraryTitle(title);
}

export function filterTitlesByContentMode(titles: LibraryTitle[], mode: ContentMode): LibraryTitle[] {
  if (mode === 'music') {
    return titles.filter(isMusicTitle);
  }
  return titles.filter((title) => !isMusicTitle(title));
}

export function filterMediaByContentMode(items: MediaItem[], mode: ContentMode): MediaItem[] {
  if (mode === 'music') {
    return items.filter((item) => item.kind === 'audio');
  }
  return items.filter((item) => item.kind === 'video');
}

/** Content-mode + titles-shelf eligibility for the library home / titles view. */
export function filterShelfLibraryTitles(titles: LibraryTitle[], mode: ContentMode): LibraryTitle[] {
  return filterBrowsableLibraryTitles(filterTitlesByContentMode(titles, mode));
}
