import { toDisplayTitleCase } from './titleCasing';
import type { SmartTitleResolution, SmartTitleResolverInput } from './types';

export const TITLE_RESOLVER_VERSION = 1;

const TECH_PATTERNS: RegExp[] = [
  /^1080p$/i, /^720p$/i, /^2160p$/i, /^1440p$/i, /^480p$/i, /^4k$/i, /^8k$/i,
  /^x26[45]$/i, /^hevc$/i, /^h\.?26[45]$/i, /^av1$/i, /^flac$/i, /^aac$/i,
  /^opus$/i, /^dts/i, /^truehd$/i, /^ma\d+p$/i, /^10bit$/i, /^8bit$/i,
  /^mkv$/i, /^mp4$/i, /^webm$/i, /^bdrip$/i, /^bluray$/i, /^web-?dl$/i, /^hdtv$/i,
  /^dvdrip$/i, /^hi\d+p$/i,
];

const VERSION_TAG_PATTERNS: RegExp[] = [
  /^upscaled?$/i,
  /^remaster(?:ed)?$/i,
  /^remux(?:ed)?$/i,
  /^hdr$/i,
  /^dv$/i,
  /^director'?s?\s*cut$/i,
];

const RELEASE_SUFFIX_PATTERNS: RegExp[] = [
  /^new$/i,
  /^final$/i,
  /^v\d+$/i,
  /^rev\d+$/i,
  /^fixed$/i,
  /^proper$/i,
  /^repack$/i,
];

export interface FilenamePreprocessResult {
  work: string;
  year?: number;
  versionTags: string[];
  technicalTags: string[];
  releaseGroupTags: string[];
  ignoredReleaseTokens: string[];
  releaseGroup?: string;
  resolution?: string;
  videoCodec?: string;
  audioCodec?: string;
  source?: string;
}

function collapseSpaces(value: string): string {
  return value.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isTechnicalToken(token: string): boolean {
  const t = token.trim();
  if (!t) return true;
  if (TECH_PATTERNS.some((pattern) => pattern.test(t))) return true;
  if (/\d{3,4}p/i.test(t)) return true;
  if (/\d{3,4}x\d{3,4}/i.test(t)) return true;
  if (/x26[45]/i.test(t)) return true;
  if (/^(aac|flac|opus|bd|bdrip|hevc)/i.test(t)) return true;
  if (/[_\s]?(x26[45]|hevc|flac|aac)/i.test(t)) return true;
  if (/^(bluray|web-?dl|hdtv)/i.test(t)) return true;
  return false;
}

export function isVersionToken(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  return VERSION_TAG_PATTERNS.some((pattern) => pattern.test(t));
}

export function isReleaseSuffixToken(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  return RELEASE_SUFFIX_PATTERNS.some((pattern) => pattern.test(t));
}

function parseTechnicalFromToken(token: string, out: FilenamePreprocessResult): void {
  const t = token.trim();
  if (!t) return;

  const resolution = t.match(/(\d{3,4}p|4k|8k|\d{3,4}x\d{3,4})/i);
  if (resolution && !out.resolution) {
    out.resolution = resolution[1].toLowerCase().includes('x')
      ? resolution[1]
      : resolution[1].toLowerCase();
  }
  if (/\bx265\b|\bh\.?265\b|\bhevc\b/i.test(t) && !out.videoCodec) out.videoCodec = 'x265';
  if (/\bx264\b|\bh\.?264\b|\bavc\b/i.test(t) && !out.videoCodec) out.videoCodec = 'x264';
  if (/flac/i.test(t) && !out.audioCodec) out.audioCodec = 'FLAC';
  if (/aac/i.test(t) && !out.audioCodec) out.audioCodec = 'AAC';
  if (/bdrip|bluray|web-?dl|hdtv|\bbd\b/i.test(t) && !out.source) {
    out.source = t.replace(/\s+/g, ' ').trim();
  }
  if (!out.technicalTags.some((tag) => tag.toLowerCase() === t.toLowerCase())) {
    out.technicalTags.push(t);
  }
}

function classifyBracketTag(tag: string, out: FilenamePreprocessResult): void {
  const normalized = tag.trim();
  if (!normalized) return;
  if (/^\d{1,3}$/.test(normalized)) return;
  if (isVersionToken(normalized)) {
    if (!out.versionTags.some((v) => v.toLowerCase() === normalized.toLowerCase())) {
      out.versionTags.push(normalized.toLowerCase());
    }
    return;
  }
  if (isTechnicalToken(normalized)) {
    parseTechnicalFromToken(normalized, out);
    return;
  }
  if (!out.releaseGroupTags.some((g) => g.toLowerCase() === normalized.toLowerCase())) {
    out.releaseGroupTags.push(normalized);
  }
}

function stripBracketTags(work: string, out: FilenamePreprocessResult): string {
  return work.replace(/\[([^\]]+)\]/g, (match, inner: string) => {
    const tag = inner.trim();
    if (/^\d{1,3}$/.test(tag)) return match;
    for (const part of inner.split(/[\s,/]+/)) {
      if (part) classifyBracketTag(part, out);
    }
    return ' ';
  });
}

function stripParenTechnicalTags(work: string, out: FilenamePreprocessResult): string {
  return work.replace(/\(([^)]+)\)/g, (match, inner: string) => {
    const parts = inner.split(/[\s,/]+/).filter(Boolean);
    const techish = parts.every((part: string) => isTechnicalToken(part) || isVersionToken(part));
    if (!techish) return match;
    for (const part of parts) {
      if (isVersionToken(part)) {
        if (!out.versionTags.some((v) => v.toLowerCase() === part.toLowerCase())) {
          out.versionTags.push(part.toLowerCase());
        }
      } else {
        parseTechnicalFromToken(part, out);
      }
    }
    return ' ';
  });
}

function stripReleaseSuffixes(work: string, out: FilenamePreprocessResult): string {
  let next = work;
  next = next.replace(/(?:^|[\s._-])(new|final|v\d+|rev\d+|fixed|proper|repack)(?:$|[\s._-])/gi, (match, token: string) => {
    if (!out.ignoredReleaseTokens.some((t) => t.toLowerCase() === token.toLowerCase())) {
      out.ignoredReleaseTokens.push(token.toLowerCase());
    }
    return ' ';
  });
  return collapseSpaces(next);
}

function stripLeadingReleaseGroup(work: string, out: FilenamePreprocessResult): string {
  const match = work.match(/^\[([^\]]+)\]\s*/);
  if (!match) return work;
  const group = match[1].trim();
  out.releaseGroup = group;
  if (!out.releaseGroupTags.includes(group)) out.releaseGroupTags.push(group);
  return work.slice(match[0].length);
}

function extractYear(work: string, out: FilenamePreprocessResult): string {
  const leading = work.match(/^(19|20)\d{2}\s+(.+)$/);
  if (leading) {
    out.year = Number.parseInt(leading[0].slice(0, 4), 10);
    return leading[2].trim();
  }

  const embedded = work.match(/[.\s(](19|20)\d{2}[.\s)]/);
  if (embedded) {
    out.year = Number.parseInt(embedded[0].replace(/\D/g, ''), 10);
    return collapseSpaces(work.replace(embedded[0], ' '));
  }

  return work;
}

function tryParseDotSeparatedRelease(work: string, out: FilenamePreprocessResult): string | null {
  if (!work.includes('.') || /\s/.test(work)) return null;

  const parts = work.split('.').filter(Boolean);
  if (parts.length < 3) return null;

  const titleParts: string[] = [];
  let cursor = 0;

  while (cursor < parts.length) {
    const part = parts[cursor]!;
    if (/^(19|20)\d{2}$/.test(part)) {
      out.year = Number.parseInt(part, 10);
      cursor += 1;
      continue;
    }
    const codecGroup = part.match(/^(x26[45]|h\.?26[45]|hevc|avc)-(.+)$/i);
    if (codecGroup) {
      parseTechnicalFromToken(codecGroup[1], out);
      const group = codecGroup[2]?.trim();
      if (group && !out.releaseGroupTags.includes(group)) out.releaseGroupTags.push(group);
      if (group && !out.releaseGroup) out.releaseGroup = group;
      cursor += 1;
      continue;
    }

    if (isTechnicalToken(part) || isVersionToken(part)) {
      if (isVersionToken(part)) {
        out.versionTags.push(part.toLowerCase());
      } else {
        parseTechnicalFromToken(part, out);
      }
      cursor += 1;
      continue;
    }

    titleParts.push(part);
    cursor += 1;
  }

  if (titleParts.length === 0) return null;
  return collapseSpaces(titleParts.join(' '));
}

/** Fast local filename cleanup — no network, no filesystem. */
export function preprocessFilename(rawWork: string): FilenamePreprocessResult {
  const out: FilenamePreprocessResult = {
    work: rawWork,
    versionTags: [],
    technicalTags: [],
    releaseGroupTags: [],
    ignoredReleaseTokens: [],
  };

  let work = rawWork.trim();
  const dotParsed = tryParseDotSeparatedRelease(work, out);
  if (dotParsed) {
    out.work = collapseSpaces(dotParsed);
    return out;
  }

  work = collapseSpaces(work);
  work = stripLeadingReleaseGroup(work, out);
  work = stripBracketTags(work, out);
  work = stripParenTechnicalTags(work, out);
  work = stripReleaseSuffixes(work, out);
  work = extractYear(work, out);

  out.work = collapseSpaces(work);
  return out;
}

export function formatCanonicalMovieTitle(title: string): string {
  const movieTail = title.match(/^(.+?)\s+the\s+(movie|film)\s*$/i);
  if (movieTail) {
    const prefix = movieTail[1].trim();
    const noun = movieTail[2].toLowerCase() === 'film' ? 'Film' : 'Movie';
    return `${prefix}: The ${noun}`;
  }
  return title;
}

function inferMediaTypeHint(
  title: string,
  episode?: number,
  specialType?: string,
  isSpecial?: boolean
): SmartTitleResolution['mediaTypeHint'] {
  if (episode != null) return 'episode';
  if (isSpecial || specialType) {
    if (specialType === 'OVA' || specialType === 'OAD') return 'ova';
    if (specialType === 'Movie') return 'movie';
    if (specialType === 'Special' || specialType === 'Extra') return 'special';
  }
  if (/\b(ova|oad)\b/i.test(title)) return 'ova';
  if (/\bthe\s+(movie|film)\b/i.test(title) || /\b(movie|film)\b/i.test(title)) return 'movie';
  if (/\b(special|extra)\b/i.test(title)) return 'special';
  return 'unknown';
}

function buildCleanSearchQuery(title: string, year?: number): string {
  const parts = [title, year != null ? String(year) : ''].filter(Boolean);
  return collapseSpaces(parts.join(' '));
}

function computeConfidence(
  title: string,
  year?: number,
  episode?: number,
  hasTechnicalSeparation?: boolean
): number {
  let score = 0.4;
  if (title.length > 3) score += 0.15;
  if (year != null) score += 0.1;
  if (episode != null) score += 0.15;
  if (hasTechnicalSeparation) score += 0.1;
  return Math.min(0.95, score);
}

/** Full local title resolution from filename hints. */
export function resolveSmartTitle(input: SmartTitleResolverInput): SmartTitleResolution {
  const raw = (input.rawFilename || input.rawTitle || '').trim();
  const extMatch = raw.match(/\.([a-z0-9]{2,5})$/i);
  const work = raw.replace(/\.[^.]+$/, '');

  const pre = preprocessFilename(work);
  let displayTitle = toDisplayTitleCase(pre.work);
  const episode = input.existingEpisode;
  const season = input.existingSeason;

  if (episode == null && /\bthe\s+(movie|film)\b/i.test(displayTitle)) {
    displayTitle = formatCanonicalMovieTitle(displayTitle);
  }

  const mediaTypeHint = inferMediaTypeHint(displayTitle, episode, undefined, false);
  const canonicalTitle = episode == null ? displayTitle : undefined;
  const cleanSearchQuery = buildCleanSearchQuery(
    toDisplayTitleCase(pre.work),
    pre.year
  );

  return {
    rawTitle: raw,
    displayTitle,
    canonicalTitle,
    cleanSearchQuery,
    year: pre.year,
    season,
    episode,
    mediaTypeHint,
    versionTags: pre.versionTags,
    technicalTags: pre.technicalTags,
    releaseGroupTags: pre.releaseGroupTags,
    ignoredReleaseTokens: pre.ignoredReleaseTokens,
    confidence: computeConfidence(displayTitle, pre.year, episode, pre.technicalTags.length > 0),
    needsExternalMetadata: pre.year == null && episode == null && mediaTypeHint === 'unknown',
    warnings: [],
  };
}

export function mergePreprocessIntoParsed(
  pre: FilenamePreprocessResult,
  target: {
    versionTags?: string[];
    technicalTags: string[];
    releaseGroup?: string;
    resolution?: string;
    videoCodec?: string;
    audioCodec?: string;
    source?: string;
    year?: number;
    ignoredReleaseTokens?: string[];
    releaseGroupTags?: string[];
  }
): void {
  if (!target.versionTags) target.versionTags = [];
  for (const tag of pre.versionTags) {
    if (!target.versionTags.some((v) => v.toLowerCase() === tag.toLowerCase())) {
      target.versionTags.push(tag);
    }
  }
  for (const tag of pre.technicalTags) {
    if (!target.technicalTags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      target.technicalTags.push(tag);
    }
  }
  if (!target.releaseGroupTags) target.releaseGroupTags = [];
  for (const tag of pre.releaseGroupTags) {
    if (!target.releaseGroupTags.some((g) => g.toLowerCase() === tag.toLowerCase())) {
      target.releaseGroupTags.push(tag);
    }
  }
  if (!target.ignoredReleaseTokens) target.ignoredReleaseTokens = [];
  for (const token of pre.ignoredReleaseTokens) {
    if (!target.ignoredReleaseTokens.includes(token)) target.ignoredReleaseTokens.push(token);
  }
  if (pre.releaseGroup && !target.releaseGroup) target.releaseGroup = pre.releaseGroup;
  if (!target.releaseGroup && pre.releaseGroupTags.length > 0) {
    target.releaseGroup = pre.releaseGroupTags[pre.releaseGroupTags.length - 1];
  }
  if (pre.resolution && !target.resolution) target.resolution = pre.resolution;
  if (pre.videoCodec && !target.videoCodec) target.videoCodec = pre.videoCodec;
  if (pre.audioCodec && !target.audioCodec) target.audioCodec = pre.audioCodec;
  if (pre.source && !target.source) target.source = pre.source;
  if (pre.year && !target.year) target.year = pre.year;
}
