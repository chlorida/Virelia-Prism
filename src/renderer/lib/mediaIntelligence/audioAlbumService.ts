import type { MediaItem } from '../../../shared/types';
import { toDisplayTitleCase } from './titleCasing';

const GENERIC_FOLDER_NAMES = /^(music|audio|soundtrack|ost|soundtracks|downloads|mp3|flac|wav|tracks|songs|albums)$/i;

export function isAudioOnlyItems(items: MediaItem[]): boolean {
  return items.length > 0 && items.every((item) => item.kind === 'audio');
}

export function isAudioOnlyLibraryTitle(title: { items: MediaItem[]; mediaType?: string }): boolean {
  return title.mediaType === 'album' || isAudioOnlyItems(title.items);
}

export function normalizeAudioFolderKey(folderPath?: string): string {
  if (!folderPath) return 'unknown';
  return folderPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function buildAudioAlbumIdentityKey(item: MediaItem): string {
  return `album:${normalizeAudioFolderKey(item.folder)}`;
}

export interface ParsedAudioTrackName {
  trackNumber?: number;
  albumHint?: string;
  trackTitle?: string;
}

export function parseAudioTrackName(fileName: string): ParsedAudioTrackName {
  const stem = fileName.replace(/\.[^.]+$/, '');
  const numbered = stem.match(/^(\d{1,3})\s*[-._]\s*(.+)$/);
  if (!numbered) {
    return { trackTitle: stem };
  }

  const trackNumber = Number.parseInt(numbered[1]!, 10);
  const rest = numbered[2]!.trim();
  const segments = rest.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
  if (segments.length >= 2) {
    return {
      trackNumber,
      albumHint: segments.slice(0, -1).join(' - '),
      trackTitle: segments[segments.length - 1],
    };
  }

  return { trackNumber, trackTitle: rest };
}

function humanizeFolderName(folderPath?: string): string | undefined {
  if (!folderPath) return undefined;
  const parts = folderPath.replace(/\\/g, '/').split('/').filter(Boolean);
  const leaf = parts[parts.length - 1];
  if (!leaf || GENERIC_FOLDER_NAMES.test(leaf)) return undefined;
  return toDisplayTitleCase(leaf.replace(/[_]+/g, ' '));
}

function longestCommonPrefix(values: string[]): string {
  if (values.length === 0) return '';
  let prefix = values[0] ?? '';
  for (const value of values.slice(1)) {
    while (prefix && !value.toLowerCase().startsWith(prefix.toLowerCase())) {
      prefix = prefix.slice(0, -1);
    }
    if (!prefix) break;
  }
  return prefix.trim().replace(/[-–—\s]+$/g, '');
}

function normalizeAlbumLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function deriveAlbumDisplayTitle(items: MediaItem[]): string {
  const parsed = items.map((item) => parseAudioTrackName(item.fileName));
  const albumHints = [...new Set(
    parsed.map((entry) => entry.albumHint).filter((value): value is string => Boolean(value))
  )];

  if (albumHints.length === 1) {
    return toDisplayTitleCase(normalizeAlbumLabel(albumHints[0]!));
  }

  const strippedTitles = parsed
    .map((entry) => entry.trackTitle ?? entry.albumHint)
    .filter((value): value is string => Boolean(value));
  const common = longestCommonPrefix(strippedTitles);
  if (common.length >= 4) {
    return toDisplayTitleCase(normalizeAlbumLabel(common));
  }

  const folderTitle = humanizeFolderName(items[0]?.folder);
  if (folderTitle) return folderTitle;

  const fallback = strippedTitles[0] ?? items[0]?.title ?? 'Audio';
  return toDisplayTitleCase(normalizeAlbumLabel(fallback));
}

export function isAlbumLibraryTitle(title: { items: MediaItem[]; mediaType?: string }): boolean {
  return isAudioOnlyLibraryTitle(title) && title.items.length > 0;
}

/** Stable track order for album detail views (track number, then filename). */
export function sortAlbumTracks(items: MediaItem[]): MediaItem[] {
  return [...items].sort((a, b) => {
    const na = parseAudioTrackName(a.fileName).trackNumber ?? 9999;
    const nb = parseAudioTrackName(b.fileName).trackNumber ?? 9999;
    if (na !== nb) return na - nb;
    return a.fileName.localeCompare(b.fileName, undefined, { numeric: true });
  });
}

export function resolveAlbumTrackLabel(item: MediaItem): string {
  const parsed = parseAudioTrackName(item.fileName);
  return parsed.trackTitle ?? item.title ?? item.fileName;
}
