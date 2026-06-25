import type { MediaItem } from '../../../shared/types';
import { normalizeAliasKey } from './aliasCache';
import {
  buildAudioAlbumIdentityKey,
  deriveAlbumDisplayTitle,
  isAudioOnlyItems,
  parseAudioTrackName,
} from './audioAlbumService';
import { isSpecialMedia, normalizeSeriesKey, hasExplicitEpisodeMarker } from './episodeParser';
import { getCachedParsedIdentity } from './mediaIdentityCache';
import { isLibraryTitleSourceItem } from './playableMediaFilter';
import { buildMediaDisplayIdentity } from './mediaIdentityService';
import {
  buildEpisodeIdentityKey,
  buildEpisodeVersion,
  markPreferredVersions,
  pickBestVersionItem,
} from './episodeVersionService';
import type { LibraryEpisode, LibraryTitle } from './types';

let titlesCacheKey = '';
let titlesCacheItems: LibraryTitle[] = [];

function mapMediaType(
  parsed: ReturnType<typeof getCachedParsedIdentity>
): LibraryTitle['mediaType'] {
  if (parsed.mediaTypeHint === 'ova') return 'ova';
  if (parsed.mediaTypeHint === 'special') return 'special';
  if (parsed.isSpecial) {
    if (parsed.specialType === 'OVA' || parsed.specialType === 'OAD') return 'ova';
    if (parsed.specialType === 'Movie') return 'movie';
    return 'special';
  }
  if (parsed.mediaTypeHint === 'movie') return 'movie';
  if (parsed.episodeNumber != null) return 'series';
  return 'unknown';
}

/** Stable identity for grouping works across folders and duplicate copies. */
export function buildTitleIdentityKey(
  item: MediaItem,
  parsed: ReturnType<typeof getCachedParsedIdentity>
): string {
  if (item.kind === 'audio') {
    return buildAudioAlbumIdentityKey(item);
  }

  const seriesKey = normalizeSeriesKey(parsed);
  if (parsed.episodeNumber != null && seriesKey && hasExplicitEpisodeMarker(item.fileName, seriesKey)) {
    return `series:${seriesKey}`;
  }

  if (!isSpecialMedia(parsed) && seriesKey && hasExplicitEpisodeMarker(item.fileName, seriesKey)) {
    return `series:${seriesKey}`;
  }

  const workKey = normalizeAliasKey(
    parsed.canonicalTitle ?? parsed.probableSeriesTitle ?? parsed.cleanTitle ?? item.title
  );
  const yearPart = parsed.year ?? 'na';
  return `work:${workKey}:${yearPart}`;
}

function buildAudioLibraryEpisodes(
  titleId: string,
  items: MediaItem[],
): LibraryEpisode[] {
  const episodes = items.map((item) => {
    const parsedTrack = parseAudioTrackName(item.fileName);
    const parsed = getCachedParsedIdentity(item);
    const episodeNumber = parsedTrack.trackNumber ?? parsed.episodeNumber;
    const displayTitle = parsedTrack.trackTitle ?? item.title;
    return {
      id: `${titleId}:track-${item.id}`,
      titleId,
      episodeNumber,
      displayTitle,
      versions: [buildEpisodeVersion(item)],
      preferredItemId: item.id,
      durationSeconds: item.durationSeconds,
    };
  });

  episodes.sort((a, b) => {
    const ea = a.episodeNumber ?? 9999;
    const eb = b.episodeNumber ?? 9999;
    if (ea !== eb) return ea - eb;
    return a.displayTitle.localeCompare(b.displayTitle);
  });

  return episodes;
}

function buildLibraryEpisodes(
  titleId: string,
  items: MediaItem[],
  language?: string
): LibraryEpisode[] {
  const groups = new Map<string, MediaItem[]>();

  for (const item of items) {
    const parsed = getCachedParsedIdentity(item);
    const key = buildEpisodeIdentityKey(parsed);
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  const episodes: LibraryEpisode[] = [];

  for (const [key, groupItems] of groups) {
    const representative = groupItems[0];
    if (!representative) continue;
    const parsed = getCachedParsedIdentity(representative);
    const display = buildMediaDisplayIdentity(representative, language);
    const preferred = pickBestVersionItem(groupItems);
    const versions = groupItems.map((item) => buildEpisodeVersion(item));

    episodes.push({
      id: `${titleId}:${key}`,
      titleId,
      episodeNumber: parsed.episodeNumber,
      seasonNumber: parsed.seasonNumber,
      displayTitle: display.title,
      versions,
      preferredItemId: preferred?.id,
      durationSeconds: preferred?.durationSeconds ?? groupItems.find((i) => i.durationSeconds)?.durationSeconds,
    });
  }

  episodes.sort((a, b) => {
    const sa = a.seasonNumber ?? 0;
    const sb = b.seasonNumber ?? 0;
    if (sa !== sb) return sa - sb;
    const ea = a.episodeNumber ?? 9999;
    const eb = b.episodeNumber ?? 9999;
    if (ea !== eb) return ea - eb;
    return a.displayTitle.localeCompare(b.displayTitle);
  });

  markPreferredVersions(episodes);
  return episodes;
}

function computeTitleStats(
  items: MediaItem[],
  episodes: LibraryEpisode[],
  mediaType: LibraryTitle['mediaType']
): Pick<LibraryTitle, 'uniqueEpisodeCount' | 'totalFileCount' | 'duplicateVersionCount' | 'preferredItemId'> {
  const totalFileCount = items.length;
  const numberedEpisodes = episodes.filter((ep) => ep.episodeNumber != null);
  let uniqueEpisodeCount = numberedEpisodes.length;

  if (uniqueEpisodeCount === 0 && totalFileCount > 0) {
    uniqueEpisodeCount = mediaType === 'movie' || mediaType === 'ova' || mediaType === 'special' ? 1 : episodes.length;
  }

  const duplicateVersionCount = Math.max(0, totalFileCount - uniqueEpisodeCount);
  const preferredItem = pickBestVersionItem(items);

  return {
    uniqueEpisodeCount,
    totalFileCount,
    duplicateVersionCount,
    preferredItemId: preferredItem?.id,
  };
}

function buildCacheSignature(items: MediaItem[]): string {
  if (items.length === 0) return '0';
  const first = items[0]!;
  const last = items[items.length - 1]!;
  return `${items.length}:${first.id}:${last.id}:${first.mtimeMs ?? 0}`;
}

/** Group media items into title-level library entries (local parser only). */
export function buildLibraryTitles(items: MediaItem[], language?: string): LibraryTitle[] {
  const eligible = items.filter(isLibraryTitleSourceItem);
  const signature = `${buildCacheSignature(eligible)}:${language ?? 'en'}`;
  if (signature === titlesCacheKey) return titlesCacheItems;

  const groups = new Map<string, { items: MediaItem[]; folderPath?: string }>();

  for (const item of eligible) {
    const parsed = getCachedParsedIdentity(item);
    const key = buildTitleIdentityKey(item, parsed);
    const bucket = groups.get(key) ?? { items: [], folderPath: item.folder };
    bucket.items.push(item);
    groups.set(key, bucket);
  }

  const titles: LibraryTitle[] = [];

  for (const [key, bucket] of groups) {
    const representative = bucket.items[0];
    if (!representative) continue;
    const parsed = getCachedParsedIdentity(representative);
    const display = buildMediaDisplayIdentity(representative, language);
    const audioOnly = isAudioOnlyItems(bucket.items);
    const episodes = audioOnly
      ? buildAudioLibraryEpisodes(key, bucket.items)
      : buildLibraryEpisodes(key, bucket.items, language);
    const numberedCount = episodes.filter((ep) => {
      if (ep.episodeNumber == null) return false;
      const repId = ep.preferredItemId ?? ep.versions[0]?.itemId;
      const rep = repId ? bucket.items.find((item) => item.id === repId) : representative;
      return rep ? hasExplicitEpisodeMarker(rep.fileName, normalizeSeriesKey(getCachedParsedIdentity(rep))) : false;
    }).length;
    const mediaType = audioOnly
      ? 'album'
      : numberedCount >= 2
        ? 'series'
        : mapMediaType(parsed);
    const stats = computeTitleStats(bucket.items, episodes, mediaType);

    let displayTitle = display.title;
    if (audioOnly) {
      displayTitle = deriveAlbumDisplayTitle(bucket.items);
    } else if (numberedCount >= 2 && parsed.probableSeriesTitle) {
      displayTitle = parsed.localizedTitle ?? parsed.probableSeriesTitle;
    } else if (parsed.canonicalTitle) {
      displayTitle = parsed.localizedTitle ?? parsed.canonicalTitle;
    }

    titles.push({
      id: key,
      canonicalTitle: audioOnly
        ? deriveAlbumDisplayTitle(bucket.items)
        : parsed.canonicalTitle ?? parsed.probableSeriesTitle ?? parsed.cleanTitle,
      displayTitle,
      localizedTitle: parsed.localizedTitle,
      year: parsed.year,
      mediaType,
      items: bucket.items,
      episodes: episodes.length > 0 ? episodes : undefined,
      ...stats,
      confidence: numberedCount >= 2 ? 0.85 : parsed.confidence,
      source: 'local-parser',
      versionTags: parsed.versionTags,
      technicalTags: parsed.technicalTags,
      franchiseId: parsed.franchiseId,
      folderPath: bucket.folderPath,
    });
  }

  titles.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle, undefined, { sensitivity: 'base' }));
  titlesCacheKey = signature;
  titlesCacheItems = titles;
  return titles;
}

export { buildLibraryTitleSearchHaystack, filterLibraryTitles } from './librarySearchService';

export function findLibraryTitleByMediaId(
  titles: LibraryTitle[],
  mediaId?: string | null
): LibraryTitle | undefined {
  if (!mediaId) return undefined;
  return titles.find((title) => title.items.some((item) => item.id === mediaId));
}

export function findLibraryTitleById(titles: LibraryTitle[], id?: string | null): LibraryTitle | undefined {
  if (!id) return undefined;
  return titles.find((title) => title.id === id);
}

export function findLibraryEpisodeByItemId(
  title: LibraryTitle,
  itemId: string
): LibraryEpisode | undefined {
  return title.episodes?.find((ep) => ep.versions.some((v) => v.itemId === itemId));
}

export function invalidateLibraryTitlesCache(): void {
  titlesCacheKey = '';
  titlesCacheItems = [];
}
