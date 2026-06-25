import type { LibraryTitle } from '../types';
import type { MetadataSearchResult } from './types';
import { METADATA_MIN_CONFIDENCE } from '../../../../shared/titleMetadataCache';
import { findSeriesAlias, findWorkAlias } from '../aliasCache';

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Strip episode/file suffixes so series lookup uses the parent title. */
export function stripEpisodeSuffix(title: string): string {
  return title
    .replace(/\s*(?:[-–—:]\s*)?(?:ep|episode)\s*\d+.*$/i, '')
    .replace(/\s*\[\d{1,3}\].*$/i, '')
    .replace(/\s+-\s+\d{1,3}\s*$/i, '')
    .trim();
}

const SEASON_TAGS = ['gou', 'sotsu', 'kai', 'kaku', 'reyou', 'matsuri', 'outbreak'] as const;

function seasonTagsIn(norm: string): Set<string> {
  const found = new Set<string>();
  for (const tag of SEASON_TAGS) {
    if (norm.includes(tag)) found.add(tag);
  }
  return found;
}

function scoreSeasonDiscriminator(localNorm: string, candidateNorm: string): number {
  const localTags = seasonTagsIn(localNorm);
  const candTags = seasonTagsIn(candidateNorm);

  if (localTags.size > 0 && candTags.size === 0) {
    return -0.32;
  }

  if (localTags.size > 0 && candTags.size > 0) {
    let overlap = 0;
    for (const tag of localTags) {
      if (candTags.has(tag)) overlap += 1;
    }
    if (overlap === 0) return -0.42;
    if (overlap === localTags.size && overlap === candTags.size) return 0.2;
    return 0.08 * overlap;
  }

  let delta = 0;
  for (const tag of SEASON_TAGS) {
    const localHas = localNorm.includes(tag);
    const candHas = candidateNorm.includes(tag);
    if (localHas && candHas) delta += 0.18;
    else if (localHas && !candHas) delta -= 0.22;
    else if (!localHas && candHas) delta -= 0.14;
  }
  if (localNorm.includes('gou') && candidateNorm.includes('sotsu') && !candidateNorm.includes('gou')) {
    delta -= 0.35;
  }
  if (localNorm.includes('sotsu') && candidateNorm.includes('gou') && !candidateNorm.includes('sotsu')) {
    delta -= 0.35;
  }
  if (localNorm.includes('kaku') && candidateNorm.includes('sotsu') && !candidateNorm.includes('kaku')) {
    delta -= 0.35;
  }
  if (localNorm.includes('sotsu') && candidateNorm.includes('kaku') && !candidateNorm.includes('sotsu')) {
    delta -= 0.35;
  }
  return delta;
}

function mediaTypeToKind(mediaType: LibraryTitle['mediaType']): string {
  if (mediaType === 'movie') return 'movie';
  if (mediaType === 'series') return 'series';
  if (mediaType === 'ova' || mediaType === 'special') return 'anime';
  return 'unknown';
}

export interface TitleMatchInput {
  title: string;
  aliases?: string[];
  year?: number;
  mediaType: LibraryTitle['mediaType'];
  episodeCount?: number;
}

export function cleanMovieSearchTitle(title: string): string {
  return stripEpisodeSuffix(title)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(upscaled|remastered|repack|proper|final|new)\b/gi, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildTitleMatchInput(libraryTitle: LibraryTitle): TitleMatchInput {
  const rawBase = libraryTitle.canonicalTitle || libraryTitle.displayTitle;
  const baseTitle = libraryTitle.mediaType === 'movie'
    ? cleanMovieSearchTitle(rawBase)
    : stripEpisodeSuffix(rawBase);
  const alias = findSeriesAlias(baseTitle)
    ?? findSeriesAlias(libraryTitle.displayTitle)
    ?? findWorkAlias(baseTitle)
    ?? findWorkAlias(libraryTitle.displayTitle);
  const aliasTitles = alias
    ? [alias.titles.en, alias.titles.romaji, alias.titles.ru, alias.titles.original]
      .filter((v): v is string => Boolean(v?.trim()))
    : [];

  const aliases = [
    baseTitle,
    libraryTitle.localizedTitle && stripEpisodeSuffix(libraryTitle.localizedTitle),
    libraryTitle.canonicalTitle !== libraryTitle.displayTitle
      ? stripEpisodeSuffix(libraryTitle.displayTitle)
      : undefined,
    ...aliasTitles.map((title) => stripEpisodeSuffix(title)),
  ].filter((v, index, arr): v is string => Boolean(v?.trim()) && arr.indexOf(v) === index);

  const preferredTitle = stripEpisodeSuffix(
    alias?.titles.en
    ?? libraryTitle.localizedTitle
    ?? baseTitle
  );

  return {
    title: preferredTitle,
    aliases: aliases.filter((value) => value !== preferredTitle),
    year: libraryTitle.year,
    mediaType: libraryTitle.mediaType,
    episodeCount: libraryTitle.uniqueEpisodeCount,
  };
}

export function scoreMetadataCandidate(
  local: TitleMatchInput,
  candidate: MetadataSearchResult
): number {
  const localNorm = normalizeTitle(local.title);
  const candidateNorm = normalizeTitle(candidate.title);
  let score = candidate.confidence ?? 0.45;

  if (localNorm && candidateNorm && localNorm === candidateNorm) score += 0.38;
  else if (localNorm && candidateNorm && (candidateNorm.includes(localNorm) || localNorm.includes(candidateNorm))) {
    score += 0.22;
  }

  for (const alias of local.aliases ?? []) {
    const aliasNorm = normalizeTitle(stripEpisodeSuffix(alias));
    if (aliasNorm && aliasNorm === candidateNorm) score += 0.28;
  }

  if (local.year && candidate.year && local.year === candidate.year) score += 0.14;
  else if (local.year && candidate.year && Math.abs(local.year - candidate.year) === 1) score += 0.05;

  const expectedKind = mediaTypeToKind(local.mediaType);
  if (expectedKind !== 'unknown' && candidate.kind === expectedKind) score += 0.1;
  if (local.mediaType === 'series' && candidate.kind === 'anime') score += 0.08;
  if ((local.mediaType === 'ova' || local.mediaType === 'special') && candidate.kind === 'anime') score += 0.1;
  if (local.mediaType === 'movie' && candidate.kind === 'movie') score += 0.12;
  if (local.mediaType === 'movie' && candidate.kind !== 'movie') score -= 0.2;
  if ((local.mediaType === 'ova' || local.mediaType === 'special') && candidate.kind === 'movie') score -= 0.25;
  if ((local.mediaType === 'ova' || local.mediaType === 'special') && candidate.kind === 'series') score -= 0.15;

  score += scoreSeasonDiscriminator(localNorm, candidateNorm);

  return Math.min(1, Math.max(0, score));
}

export function pickBestMetadataMatch(
  local: TitleMatchInput,
  candidates: MetadataSearchResult[]
): { best?: MetadataSearchResult; confidence: number; needsReview: boolean } {
  if (candidates.length === 0) return { confidence: 0, needsReview: false };

  const scored = candidates
    .map((candidate) => ({
      candidate,
      confidence: scoreMetadataCandidate(local, candidate),
    }))
    .sort((a, b) => {
      const diff = b.confidence - a.confidence;
      if (Math.abs(diff) < 0.06) {
        const providerRank = (id: string) => (id === 'anilist' ? 2 : id === 'jikan' ? 1 : 0);
        const rankDiff = providerRank(b.candidate.providerId) - providerRank(a.candidate.providerId);
        if (rankDiff !== 0) return rankDiff;
      }
      return diff;
    });

  const top = scored[0];
  const second = scored[1];
  const needsReview = Boolean(
    second && top.confidence >= METADATA_MIN_CONFIDENCE && second.confidence >= METADATA_MIN_CONFIDENCE
      && top.confidence - second.confidence < 0.08
  );

  if (!top || top.confidence < METADATA_MIN_CONFIDENCE) {
    return { confidence: top?.confidence ?? 0, needsReview: true };
  }

  return { best: top.candidate, confidence: top.confidence, needsReview };
}
