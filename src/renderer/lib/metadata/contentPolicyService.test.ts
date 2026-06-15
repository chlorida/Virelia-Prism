import { describe, expect, it } from 'vitest';
import { filterCatalogResults, isLikelyAdultResult } from './contentPolicyService';
import type { MetadataSearchResult } from './types';

function result(partial: Partial<MetadataSearchResult> & Pick<MetadataSearchResult, 'title'>): MetadataSearchResult {
  return {
    catalogId: 'test:1',
    provider: 'anilist',
    providerId: '1',
    type: 'anime',
    confidence: 0.8,
    source: 'test',
    ...partial,
  };
}

describe('contentPolicyService', () => {
  it('filters explicit adult flag when includeAdult is false', () => {
    const items = [
      result({ title: 'Sailor Moon', isAdult: false }),
      result({ title: 'Adult Title', isAdult: true }),
    ];
    const filtered = filterCatalogResults(items, false);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('Sailor Moon');
  });

  describe('isLikelyAdultResult', () => {
    it('blocks when isAdult is true', () => {
      expect(isLikelyAdultResult(result({ title: 'Safe Title', isAdult: true }))).toBe(true);
      expect(isLikelyAdultResult(result({ title: 'Safe Title', isAdult: false }))).toBe(false);
    });

    it('blocks adult genres', () => {
      expect(isLikelyAdultResult(result({ title: 'Safe Title', genres: ['Hentai'] }))).toBe(true);
      expect(isLikelyAdultResult(result({ title: 'Safe Title', genres: ['Erotica'] }))).toBe(true);
      expect(isLikelyAdultResult(result({ title: 'Safe Title', genres: ['Adult'] }))).toBe(true);
    });

    it('blocks title keywords without genre or isAdult flag', () => {
      expect(isLikelyAdultResult(result({ title: 'Sexy Sailor Soldiers' }))).toBe(true);
    });

    it('checks originalTitle and overview for keywords', () => {
      expect(isLikelyAdultResult(result({ title: 'Innocent', originalTitle: 'A hentai spin-off' }))).toBe(true);
      expect(isLikelyAdultResult(result({ title: 'Innocent', overview: 'An ecchi comedy adventure' }))).toBe(true);
    });

    it('allows safe titles like Sailor Moon', () => {
      expect(isLikelyAdultResult(result({ title: 'Bishoujo Senshi Sailor Moon Crystal' }))).toBe(false);
    });
  });

  it('filterCatalogResults removes heuristic adult items', () => {
    const items = [
      result({ title: 'Sailor Moon' }),
      result({ title: 'Sexy Sailor Soldiers' }),
    ];
    const filtered = filterCatalogResults(items, false);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('Sailor Moon');
  });

  it('passes all results when includeAdult is true', () => {
    const items = [result({ title: 'Adult Title', isAdult: true })];
    expect(filterCatalogResults(items, true)).toHaveLength(1);
  });
});
