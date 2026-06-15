import type { MetadataSearchResult } from './types';

function normalizeText(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(/[^a-z0-9]+/i).filter((t) => t.length >= 2);
}

function relevanceScore(query: string, item: MetadataSearchResult): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;
  const fields = [item.title, item.originalTitle].filter(Boolean) as string[];
  const titleNorm = normalizeText(fields.join(' '));
  const titleWords = tokenize(titleNorm);
  let score = 0;
  for (const token of qTokens) {
    if (titleNorm === token) score += 1;
    else if (titleWords.some((w) => w === token)) score += 1;
    else if (titleNorm.startsWith(token)) score += 0.85;
    else if (titleNorm.includes(` ${token}`) || titleNorm.includes(token)) score += 0.55;
  }
  if (qTokens.length > 1 && qTokens.every((t) => titleNorm.includes(t))) score += 0.35;
  return Math.min(1, score / qTokens.length);
}

function popularityNorm(item: MetadataSearchResult): number {
  const pop = item.popularity ?? item.confidence * 100;
  return Math.min(1, Math.log10(Math.max(1, pop)) / 5);
}

export function rankSearchResults(query: string, results: MetadataSearchResult[]): MetadataSearchResult[] {
  return [...results].sort((a, b) => {
    const scoreA = relevanceScore(query, a) * 0.6 + popularityNorm(a) * 0.3 + a.confidence * 0.1;
    const scoreB = relevanceScore(query, b) * 0.6 + popularityNorm(b) * 0.3 + b.confidence * 0.1;
    if (scoreB !== scoreA) return scoreB - scoreA;
    if (Boolean(b.posterUrl) !== Boolean(a.posterUrl)) return Boolean(b.posterUrl) ? 1 : -1;
    return (b.overview?.length ?? 0) - (a.overview?.length ?? 0);
  });
}
