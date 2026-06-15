import { describe, expect, it } from 'vitest';
import { rankSearchResults } from './searchRankingService';
import type { MetadataSearchResult } from './types';

function r(title: string, popularity = 50, extra: Partial<MetadataSearchResult> = {}): MetadataSearchResult {
  return {
    catalogId: `t:${title}`,
    provider: 'anilist',
    providerId: title,
    title,
    type: 'anime',
    popularity,
    confidence: 0.8,
    source: 'test',
    ...extra,
  };
}

describe('searchRankingService', () => {
  it('ranks Sailor Moon above niche adult OVA for query sailor', () => {
    const ranked = rankSearchResults('sailor', [
      r('Sexy Sailor Soldiers', 120, { genres: ['Hentai'], isAdult: true }),
      r('Bishoujo Senshi Sailor Moon Crystal', 89000),
      r('Sailor Fuku Shinryou Tsumaka', 200),
    ]);
    expect(ranked[0].title).toContain('Sailor Moon');
  });

  it('still boosts high popularity when relevance is similar', () => {
    const ranked = rankSearchResults('one piece', [
      r('One Piece Film: Red', 5000),
      r('One Piece', 500000),
    ]);
    expect(ranked[0].title).toBe('One Piece');
  });
});
