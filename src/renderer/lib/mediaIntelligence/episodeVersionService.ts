import type { MediaItem } from '../../../shared/types';
import { normalizeAliasKey } from './aliasCache';
import { getCachedParsedIdentity } from './mediaIdentityCache';
import type { EpisodeVersion, LibraryEpisode, ParsedMediaIdentity } from './types';

function resolutionScore(resolution?: string): number {
  const res = resolution?.toLowerCase() ?? '';
  if (res.includes('2160') || res.includes('4k')) return 400;
  if (res.includes('1440')) return 350;
  if (res.includes('1080')) return 300;
  if (res.includes('720')) return 200;
  if (res.includes('480')) return 100;
  return 50;
}

function sourceScore(source?: string): number {
  const s = source?.toLowerCase() ?? '';
  if (s.includes('bluray') || s.includes('blu-ray') || s.includes('bd')) return 300;
  if (s.includes('web-dl') || s.includes('webdl')) return 250;
  if (s.includes('hdtv')) return 150;
  return 50;
}

function codecScore(codec?: string): number {
  const c = codec?.toLowerCase() ?? '';
  if (c.includes('265') || c.includes('hevc')) return 20;
  if (c.includes('264') || c.includes('avc')) return 10;
  return 0;
}

/** Stable episode identity within a title group. */
export function buildEpisodeIdentityKey(parsed: ParsedMediaIdentity): string {
  if (parsed.isSpecial) {
    return `special:${parsed.specialType ?? 'unknown'}:${normalizeAliasKey(parsed.cleanTitle)}`;
  }
  const season = parsed.seasonNumber ?? 0;
  if (parsed.episodeNumber != null) {
    return `s${season}:e${parsed.episodeNumber}`;
  }
  return `work:${normalizeAliasKey(parsed.canonicalTitle ?? parsed.cleanTitle ?? parsed.rawTitle)}`;
}

export function buildEpisodeVersion(item: MediaItem): EpisodeVersion {
  const parsed = getCachedParsedIdentity(item);
  return {
    itemId: item.id,
    path: item.filePath,
    filename: item.fileName,
    resolution: parsed.resolution,
    codec: parsed.videoCodec,
    audioCodec: parsed.audioCodec,
    releaseGroup: parsed.releaseGroup,
    technicalTags: parsed.technicalTags,
    versionTags: parsed.versionTags ?? [],
  };
}

/** Prefer highest quality among duplicate versions; tie-break by resume progress. */
export function pickBestVersionItem(items: MediaItem[]): MediaItem | undefined {
  if (items.length === 0) return undefined;
  return [...items].sort((a, b) => {
    const resumeA = a.resumePositionSeconds ?? 0;
    const resumeB = b.resumePositionSeconds ?? 0;
    if (resumeA > 30 && resumeB <= 30) return -1;
    if (resumeB > 30 && resumeA <= 30) return 1;

    const parsedA = getCachedParsedIdentity(a);
    const parsedB = getCachedParsedIdentity(b);

    const resDiff = resolutionScore(parsedB.resolution) - resolutionScore(parsedA.resolution);
    if (resDiff !== 0) return resDiff;

    const srcDiff = sourceScore(parsedB.source) - sourceScore(parsedA.source);
    if (srcDiff !== 0) return srcDiff;

    const codecDiff = codecScore(parsedB.videoCodec) - codecScore(parsedA.videoCodec);
    if (codecDiff !== 0) return codecDiff;

    const durA = a.durationSeconds ?? 0;
    const durB = b.durationSeconds ?? 0;
    if (durA > 0 && durB <= 0) return -1;
    if (durB > 0 && durA <= 0) return 1;

    return a.id.localeCompare(b.id);
  })[0];
}

export function markPreferredVersions(episodes: LibraryEpisode[]): void {
  for (const episode of episodes) {
    const preferredId = episode.preferredItemId;
    for (const version of episode.versions) {
      version.isPreferred = version.itemId === preferredId;
    }
  }
}
