import { describe, expect, it } from 'vitest';
import type { LibraryTitle } from '../types';
import { buildTitleMatchInput, pickBestMetadataMatch, scoreMetadataCandidate } from './metadataMatcher';

const sonicMovie: LibraryTitle = {
  id: 'work:sonic:1996',
  canonicalTitle: 'Sonic the Hedgehog: The Movie',
  displayTitle: 'Sonic the Hedgehog: The Movie',
  year: 1996,
  mediaType: 'movie',
  items: [],
  uniqueEpisodeCount: 1,
  totalFileCount: 1,
  duplicateVersionCount: 0,
  confidence: 1,
  source: 'local-parser',
};

const sotsuSeries: LibraryTitle = {
  id: 'series:higurashi-sotsu',
  canonicalTitle: 'Higurashi no Naku Koro ni Sotsu',
  displayTitle: 'Higurashi: When They Cry – Sotsu',
  localizedTitle: 'Higurashi: When They Cry – Sotsu',
  year: 2021,
  mediaType: 'series',
  items: [],
  uniqueEpisodeCount: 15,
  totalFileCount: 15,
  duplicateVersionCount: 0,
  confidence: 1,
  source: 'local-parser',
};

describe('metadataMatcher sonic and sotsu', () => {
  it('builds sonic search title from alias', () => {
    const input = buildTitleMatchInput(sonicMovie);
    expect(input.title).toContain('Sonic');
    expect(input.mediaType).toBe('movie');
  });

  it('accepts anilist sonic movie candidate', () => {
    const input = buildTitleMatchInput(sonicMovie);
    const candidates = [
      {
        providerId: 'anilist',
        providerMediaId: '2263',
        title: 'Sonic the Hedgehog: The Movie',
        year: 1996,
        kind: 'movie' as const,
        confidence: 0.55,
      },
      {
        providerId: 'anilist',
        providerMediaId: '999',
        title: 'Sonic X',
        year: 2003,
        kind: 'anime' as const,
        confidence: 0.5,
      },
    ];
    const score = scoreMetadataCandidate(input, candidates[0]);
    expect(score).toBeGreaterThan(0.72);
    const picked = pickBestMetadataMatch(input, candidates);
    expect(picked.best?.providerMediaId).toBe('2263');
  });

  it('prefers sotsu over outbreak for sotsu series', () => {
    const input = buildTitleMatchInput(sotsuSeries);
    expect(input.title).toContain('Sotsu');
    const picked = pickBestMetadataMatch(input, [
      {
        providerId: 'anilist',
        providerMediaId: '131149',
        title: 'Higurashi: When They Cry – Sotsu',
        year: 2021,
        kind: 'anime',
        confidence: 0.55,
      },
      {
        providerId: 'anilist',
        providerMediaId: '10863',
        title: 'Higurashi: When They Cry – Outbreak',
        year: 2011,
        kind: 'anime',
        confidence: 0.55,
      },
    ]);
    expect(picked.best?.title).toContain('Sotsu');
  });
});
