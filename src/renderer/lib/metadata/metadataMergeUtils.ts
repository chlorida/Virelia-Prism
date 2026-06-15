import type { MetadataSearchResult } from './types';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'no', 'na', 'wo',
]);

function normalizeTitleText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(item: MetadataSearchResult): Set<string> {
  const parts = [item.title, item.originalTitle].filter(Boolean) as string[];
  const tokens = new Set<string>();
  for (const part of parts) {
    for (const token of normalizeTitleText(part).split(' ')) {
      if (token.length < 2 || STOP_WORDS.has(token)) continue;
      tokens.add(token);
    }
  }
  return tokens;
}

function typesCompatible(a: MetadataSearchResult['type'], b: MetadataSearchResult['type']): boolean {
  if (a === b) return true;
  if ((a === 'anime' && b === 'series') || (a === 'series' && b === 'anime')) return true;
  if (a === 'special' || b === 'special') return true;
  return false;
}

function yearsCompatible(a?: number, b?: number): boolean {
  if (!a || !b) return true;
  return Math.abs(a - b) <= 2;
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared / Math.min(a.size, b.size);
}

function areLikelyDuplicates(a: MetadataSearchResult, b: MetadataSearchResult): boolean {
  if (!typesCompatible(a.type, b.type) || !yearsCompatible(a.year, b.year)) return false;

  const tokensA = titleTokens(a);
  const tokensB = titleTokens(b);
  const overlap = overlapRatio(tokensA, tokensB);
  if (overlap >= 0.6) return true;

  const normA = normalizeTitleText(a.title);
  const normB = normalizeTitleText(b.title);
  if (normA.length >= 4 && normB.length >= 4 && (normA.includes(normB) || normB.includes(normA))) {
    return true;
  }

  const altA = a.originalTitle ? normalizeTitleText(a.originalTitle) : '';
  const altB = b.originalTitle ? normalizeTitleText(b.originalTitle) : '';
  if (altA && (altA === normB || normB.includes(altA) || altA.includes(normB))) return true;
  if (altB && (altB === normA || normA.includes(altB) || altB.includes(normA))) return true;

  return false;
}

function pickPreferred(existing: MetadataSearchResult, candidate: MetadataSearchResult): MetadataSearchResult {
  const existingPoster = Boolean(existing.posterUrl);
  const candidatePoster = Boolean(candidate.posterUrl);
  if (candidatePoster && !existingPoster) return candidate;
  if (existingPoster && !candidatePoster) return existing;
  const existingPop = existing.popularity ?? existing.confidence * 100;
  const candidatePop = candidate.popularity ?? candidate.confidence * 100;
  if (candidatePop > existingPop) return candidate;
  if (candidatePop < existingPop) return existing;
  if (candidate.confidence > existing.confidence) return candidate;
  if ((candidate.overview?.length ?? 0) > (existing.overview?.length ?? 0)) return candidate;
  return existing;
}

export function sortResultsByPopularity(results: MetadataSearchResult[]): MetadataSearchResult[] {
  return [...results].sort((a, b) => {
    const popA = a.popularity ?? a.confidence * 100;
    const popB = b.popularity ?? b.confidence * 100;
    if (popB !== popA) return popB - popA;
    return b.confidence - a.confidence;
  });
}

export function mergeDuplicateResults(results: MetadataSearchResult[]): MetadataSearchResult[] {
  const merged: MetadataSearchResult[] = [];

  for (const item of results) {
    const existingIndex = merged.findIndex((entry) => areLikelyDuplicates(entry, item));
    if (existingIndex === -1) {
      merged.push(item);
      continue;
    }
    merged[existingIndex] = pickPreferred(merged[existingIndex], item);
  }

  return merged;
}
