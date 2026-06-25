import type { ParsedMediaIdentity } from './types';
import { findSeriesAlias, getFranchiseId, normalizeAliasKey } from './aliasCache';
import { cleanJunkFromTitle, looksLikeTechnicalParen } from './junkCleaner';
import {
  formatCanonicalMovieTitle,
  isReleaseSuffixToken,
  isTechnicalToken,
  isVersionToken,
  mergePreprocessIntoParsed,
  preprocessFilename,
} from './smartTitleResolver';
import { toDisplayTitleCase } from './titleCasing';

const TECH_PATTERNS = [
  /^1080p$/i, /^720p$/i, /^2160p$/i, /^1440p$/i, /^480p$/i, /^4k$/i, /^8k$/i,
  /^x26[45]$/i, /^hevc$/i, /^h\.?26[45]$/i, /^av1$/i, /^flac$/i, /^aac$/i,
  /^opus$/i, /^dts/i, /^truehd$/i, /^ma\d+p$/i, /^10bit$/i, /^8bit$/i,
  /^mkv$/i, /^mp4$/i, /^webm$/i, /^bdrip$/i, /^bluray$/i, /^web-?dl$/i, /^hdtv$/i,
];

function isTechnicalTag(tag: string): boolean {
  const t = tag.trim();
  if (!t) return true;
  if (TECH_PATTERNS.some((p) => p.test(t))) return true;
  if (/\d{3,4}p/i.test(t)) return true;
  if (/\d{3,4}x\d{3,4}/i.test(t)) return true;
  if (/x26[45]/i.test(t)) return true;
  if (/^(aac|flac|opus|bd|bdrip|hevc)/i.test(t)) return true;
  if (/[_\s]?(x26[45]|hevc|flac|aac)/i.test(t)) return true;
  return false;
}

function collapseSpaces(s: string): string {
  return s.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseTechnicalFromTag(tag: string, out: ParsedMediaIdentity): void {
  const t = tag.trim();
  const res = t.match(/(\d{3,4}p|4k|8k|\d{3,4}x\d{3,4})/i);
  if (res && !out.resolution) {
    out.resolution = res[1].toLowerCase().includes('x') ? res[1] : res[1].toLowerCase();
  }
  if (/\bx265\b|\bh\.?265\b|\bhevc\b/i.test(t) && !out.videoCodec) out.videoCodec = 'x265';
  if (/\bx264\b|\bh\.?264\b|\bavc\b/i.test(t) && !out.videoCodec) out.videoCodec = 'x264';
  if (/flac/i.test(t) && !out.audioCodec) out.audioCodec = 'FLAC';
  if (/aac/i.test(t) && !out.audioCodec) out.audioCodec = 'AAC';
  if (/bdrip|bluray|web-?dl|hdtv|\bbd\b/i.test(t) && !out.source) out.source = t.replace(/\s+/g, ' ').trim();
  if (!out.technicalTags.includes(t)) out.technicalTags.push(t);
}

function stripExtension(raw: string): { work: string; container?: string } {
  const extMatch = raw.match(/\.([a-z0-9]{2,5})$/i);
  const container = extMatch?.[1]?.toUpperCase();
  const work = raw.replace(/\.[^.]+$/, '');
  return { work, container };
}

function stripTrailingParentheticalTech(work: string, identity: ParsedMediaIdentity): string {
  const match = work.match(/\(([^)]+)\)\s*$/);
  if (!match) return work;
  const inner = match[1].trim();
  if (!looksLikeTechnicalParen(inner)) return work;
  for (const part of inner.split(/[\s,/]+/)) {
    if (part) parseTechnicalFromTag(part, identity);
  }
  return work.slice(0, match.index).trim();
}

function looksLikeDateTimeStem(work: string): boolean {
  const trimmed = work.trim();
  if (/^\d{4}-\d{2}-\d{2}(\s+\d{2}[-:]\d{2}(-\d{2})?)?$/.test(trimmed)) return true;
  if (/^\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{2}[-_]\d{2}/.test(trimmed)) return true;
  return false;
}

/** Episode markers strong enough to group files into a series title. */
export function hasExplicitEpisodeMarker(fileName: string, seriesKey?: string): boolean {
  if (/\bS\d{1,2}E\d{1,3}\b/i.test(fileName)) return true;
  if (/\b\d{1,2}x\d{1,3}\b/i.test(fileName)) return true;
  if (/\[\d{1,3}\]/.test(fileName)) return true;
  if (/\b(ep|episode)\s*\d+/i.test(fileName)) return true;
  if (/\[[^\]]+\]/.test(fileName) && /\s[-–—]\s*\d{1,3}\b/.test(fileName)) return true;
  if (seriesKey && findSeriesAlias(seriesKey) && /\s[-–—]\s*\d{1,3}\b/.test(fileName)) {
    return true;
  }
  return false;
}

function parseDashEpisode(work: string): { title: string; episodeNumber?: number } {
  if (looksLikeDateTimeStem(work)) {
    return { title: work };
  }
  const m = work.match(/^(.+?)\s*[-–—]\s*(\d{1,3})(?:\s+v\d+)?\s*$/i);
  if (m) {
    return { title: m[1].trim(), episodeNumber: Number.parseInt(m[2], 10) };
  }
  const m2 = work.match(/^(.+?)\s+(\d{1,3})\s*$/);
  if (m2 && !/\d{4}/.test(m2[2])) {
    const ep = Number.parseInt(m2[2], 10);
    if (ep <= 999) return { title: m2[1].trim(), episodeNumber: ep };
  }
  return { title: work };
}

function parse1x03(work: string): { title: string; seasonNumber?: number; episodeNumber?: number } | null {
  const m = work.match(/^(.+?)[.\s_-]+(\d{1,2})x(\d{1,3})\b/i);
  if (!m) return null;
  return {
    title: collapseSpaces(m[1]),
    seasonNumber: Number.parseInt(m[2], 10),
    episodeNumber: Number.parseInt(m[3], 10),
  };
}

function applyAliasHints(identity: ParsedMediaIdentity): void {
  const key = normalizeAliasKey(identity.probableSeriesTitle ?? identity.cleanTitle);
  const alias = findSeriesAlias(key);
  if (alias) {
    identity.localizedTitles = { ...alias.titles };
    identity.franchiseId = alias.franchiseId;
  } else {
    identity.franchiseId = getFranchiseId(key);
  }
}

export function isSpecialMedia(identity: ParsedMediaIdentity): boolean {
  return Boolean(identity.isSpecial || identity.specialType);
}

function detectSpecialType(work: string): ParsedMediaIdentity['specialType'] | undefined {
  if (/\bova\b/i.test(work)) return 'OVA';
  if (/\boad\b/i.test(work)) return 'OAD';
  if (/\bspecials?\b/i.test(work)) return 'Special';
  if (/\b(extra|extras|bonus)\b/i.test(work)) return 'Extra';
  return undefined;
}

function stripSpecialKeywords(work: string): string {
  return collapseSpaces(
    work.replace(/\b(ova|oad|specials?|movies?|films?|extras?|bonus)\b/gi, ' ')
  );
}

function tryParseSpecial(work: string, identity: ParsedMediaIdentity): boolean {
  const tildeMatch = work.match(/~\s*([^~]+?)\s*~/i);
  const specialType = detectSpecialType(work);
  if (!tildeMatch && !specialType) return false;

  identity.isSpecial = true;
  if (specialType) identity.specialType = specialType;
  if (tildeMatch) {
    identity.specialTitle = toDisplayTitleCase(collapseSpaces(tildeMatch[1]));
  }

  let remaining = work;
  if (tildeMatch) remaining = remaining.replace(tildeMatch[0], ' ');
  remaining = stripSpecialKeywords(remaining);

  const parts = collapseSpaces(remaining).split(' ').filter(Boolean);
  for (const part of parts) {
    if (isTechnicalTag(part)) {
      parseTechnicalFromTag(part, identity);
    } else if (/^dvdrip$/i.test(part) || /^hi\d+p$/i.test(part)) {
      parseTechnicalFromTag(part, identity);
    }
  }

  const cleaned = cleanJunkFromTitle(
    parts.filter((p) => !isTechnicalTag(p) && !/^hi\d+p$/i.test(p) && !/^dvdrip$/i.test(p)).join(' ')
  );
  remaining = cleaned.text;
  identity.junkTags.push(...cleaned.junkTags);

  const yearMatch = remaining.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    identity.year = Number.parseInt(yearMatch[0], 10);
    remaining = remaining.replace(yearMatch[0], ' ').trim();
  }

  identity.cleanTitle = toDisplayTitleCase(collapseSpaces(remaining));
  identity.probableSeriesTitle = identity.cleanTitle;
  identity.episodeNumber = undefined;
  identity.seasonNumber = undefined;
  identity.cleanBaseName = identity.cleanTitle;
  identity.confidence = 0.88;
  applyAliasHints(identity);
  finalizeSpecialDisplay(identity);
  return true;
}

function finalizeSpecialDisplay(identity: ParsedMediaIdentity): void {
  const series = identity.probableSeriesTitle ?? identity.cleanTitle;
  identity.probableTitle = series;
  if (identity.specialTitle) {
    identity.displayTitle = `${series} – ${identity.specialTitle}`;
  } else {
    identity.displayTitle = series || 'Untitled';
  }
  identity.originalTitle = identity.cleanTitle || series;
}

function inferStandaloneMovieMetadata(identity: ParsedMediaIdentity, rawWork: string): void {
  if (identity.episodeNumber != null) return;
  const stem = rawWork.replace(/\.[^.]+$/, '');

  if (/^movie\./i.test(stem)) {
    identity.isSpecial = true;
    identity.specialType = 'Movie';
    identity.mediaTypeHint = 'movie';
    return;
  }

  if (/\bthe\s+(movie|film)\s*$/i.test(identity.cleanTitle)) {
    identity.mediaTypeHint = 'movie';
  }
}

function applyTitleResolutionMetadata(identity: ParsedMediaIdentity): void {
  const titleBase = identity.probableSeriesTitle ?? identity.cleanTitle;
  identity.cleanSearchQuery = [titleBase, identity.year != null ? String(identity.year) : '']
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (identity.episodeNumber != null) {
    identity.mediaTypeHint = 'episode';
  } else if (identity.isSpecial) {
    if (identity.specialType === 'OVA' || identity.specialType === 'OAD') identity.mediaTypeHint = 'ova';
    else if (identity.specialType === 'Movie') identity.mediaTypeHint = 'movie';
    else if (identity.specialType === 'Special' || identity.specialType === 'Extra') identity.mediaTypeHint = 'special';
  } else if (/\bthe\s+(movie|film)\b/i.test(identity.cleanTitle)) {
    identity.mediaTypeHint = 'movie';
  } else if (identity.episodeNumber == null && identity.probableSeriesTitle) {
    identity.mediaTypeHint = identity.episodeNumber != null ? 'episode' : 'unknown';
  }
  identity.canonicalTitle = identity.episodeNumber == null
    ? formatCanonicalMovieTitle(identity.cleanTitle || titleBase)
    : identity.probableSeriesTitle;
  identity.needsExternalMetadata = identity.confidence < 0.7 && identity.year == null;
}

function finalizeDisplay(identity: ParsedMediaIdentity, rawWork?: string): void {
  if (rawWork) inferStandaloneMovieMetadata(identity, rawWork);

  if (identity.isSpecial) {
    finalizeSpecialDisplay(identity);
    applyTitleResolutionMetadata(identity);
    return;
  }
  const series = identity.probableSeriesTitle ?? identity.cleanTitle;
  identity.probableTitle = series;
  if (identity.episodeNumber != null && series) {
    const ep = String(identity.episodeNumber).padStart(2, '0');
    if (identity.seasonNumber != null) {
      identity.displayTitle = `${series} — S${String(identity.seasonNumber).padStart(2, '0')}E${ep}`;
    } else {
      identity.displayTitle = `${series} — ${ep}`;
    }
  } else if (/\bthe\s+(movie|film)\b/i.test(identity.cleanTitle)) {
    identity.displayTitle = formatCanonicalMovieTitle(identity.cleanTitle || series);
  } else {
    identity.displayTitle = identity.cleanTitle || series || 'Untitled';
  }
  identity.originalTitle = identity.cleanTitle || series;
  applyTitleResolutionMetadata(identity);
}

/** Parse filename / title into structured media identity. */
export function parseMediaIdentity(rawTitle: string, fileName?: string): ParsedMediaIdentity {
  const raw = (fileName || rawTitle || '').trim();
  const { work: initialWork, container } = stripExtension(raw);

  const identity: ParsedMediaIdentity = {
    rawFilename: raw,
    rawTitle: rawTitle || raw,
    cleanBaseName: initialWork,
    cleanTitle: '',
    displayTitle: 'Untitled',
    probableTitle: '',
    technicalTags: [],
    versionTags: [],
    releaseGroupTags: [],
    ignoredReleaseTokens: [],
    junkTags: [],
    confidence: 0.35,
  };

  if (container) {
    identity.container = container;
    identity.technicalTags.push(container);
  }

  const preprocessed = preprocessFilename(initialWork);
  mergePreprocessIntoParsed(preprocessed, identity);
  let work = preprocessed.work;
  work = stripTrailingParentheticalTech(work, identity);

  if (identity.releaseGroup) {
    identity.confidence += 0.1;
  }

  if (tryParseSpecial(work, identity)) {
    inferStandaloneMovieMetadata(identity, initialWork);
    applyTitleResolutionMetadata(identity);
    return identity;
  }

  const tv = work.match(/^(.+?)[.\s_-]+[Ss](\d{1,2})[Ee](\d{1,3})\b/i);
  if (tv) {
    identity.probableSeriesTitle = toDisplayTitleCase(collapseSpaces(tv[1]));
    identity.seasonNumber = Number.parseInt(tv[2], 10);
    identity.episodeNumber = Number.parseInt(tv[3], 10);
    identity.cleanTitle = identity.probableSeriesTitle;
    identity.confidence = 0.9;
    applyAliasHints(identity);
    finalizeDisplay(identity, initialWork);
    return identity;
  }

  const oneX = parse1x03(work);
  if (oneX) {
    identity.probableSeriesTitle = toDisplayTitleCase(oneX.title);
    identity.seasonNumber = oneX.seasonNumber;
    identity.episodeNumber = oneX.episodeNumber;
    identity.cleanTitle = identity.probableSeriesTitle;
    identity.confidence = 0.88;
    applyAliasHints(identity);
    finalizeDisplay(identity, initialWork);
    return identity;
  }

  if (!identity.year) {
    const yearMatch = work.match(/[.\s(](19|20)\d{2}[.\s)]/);
    if (yearMatch) {
      identity.year = Number.parseInt(yearMatch[0].replace(/\D/g, ''), 10);
      work = collapseSpaces(work.replace(yearMatch[0], ' '));
    }
  }

  work = work.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const tag = inner.trim();
    if (/^\d{1,3}$/.test(tag)) {
      if (identity.episodeNumber == null) identity.episodeNumber = Number.parseInt(tag, 10);
      return ' ';
    }
    if (isVersionToken(tag)) {
      if (!identity.versionTags!.some((v) => v.toLowerCase() === tag.toLowerCase())) {
        identity.versionTags!.push(tag.toLowerCase());
      }
      return ' ';
    }
    if (isTechnicalTag(tag)) {
      parseTechnicalFromTag(tag, identity);
      return ' ';
    }
    if (!identity.releaseGroupTags!.some((g) => g.toLowerCase() === tag.toLowerCase())) {
      identity.releaseGroupTags!.push(tag);
    }
    return ' ';
  });

  work = collapseSpaces(work);

  const dash = parseDashEpisode(work);
  if (dash.episodeNumber != null) {
    work = dash.title;
    if (identity.episodeNumber == null) identity.episodeNumber = dash.episodeNumber;
  }

  work = collapseSpaces(work.replace(/(?:^|[\s._-])(new|final|v\d+|rev\d+)(?:$|[\s._-])/gi, ' '));

  const cleaned = cleanJunkFromTitle(work);
  work = cleaned.text;
  identity.junkTags.push(...cleaned.junkTags);

  const titleWords = collapseSpaces(work).split(' ').filter((part) => {
    if (isTechnicalTag(part) || isVersionToken(part) || isReleaseSuffixToken(part)) {
      if (isVersionToken(part) && !identity.versionTags!.some((v) => v.toLowerCase() === part.toLowerCase())) {
        identity.versionTags!.push(part.toLowerCase());
      } else if (isReleaseSuffixToken(part) && !identity.ignoredReleaseTokens!.includes(part.toLowerCase())) {
        identity.ignoredReleaseTokens!.push(part.toLowerCase());
      }
      return false;
    }
    return true;
  });

  identity.cleanTitle = toDisplayTitleCase(titleWords.join(' '));
  if (!identity.probableSeriesTitle) identity.probableSeriesTitle = identity.cleanTitle;

  const epTail = identity.cleanTitle.match(/\bep(?:isode)?\.?\s*(\d{1,3})\s*$/i);
  if (epTail && identity.episodeNumber == null) {
    identity.episodeNumber = Number.parseInt(epTail[1], 10);
    identity.cleanTitle = collapseSpaces(identity.cleanTitle.replace(/\bep(?:isode)?\.?\s*\d{1,3}\s*$/i, ''));
    identity.probableSeriesTitle = identity.cleanTitle;
  }

  identity.cleanBaseName = identity.cleanTitle;
  identity.confidence = identity.episodeNumber != null ? 0.82 : identity.cleanTitle.length > 3 ? 0.65 : 0.4;
  applyAliasHints(identity);
  finalizeDisplay(identity, initialWork);
  return identity;
}

export function normalizeSeriesKey(identity: ParsedMediaIdentity): string {
  const base = identity.probableSeriesTitle ?? identity.cleanTitle ?? identity.rawTitle;
  return normalizeAliasKey(base);
}
