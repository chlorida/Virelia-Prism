import { describe, expect, it } from 'vitest';
import { buildTitleMatchInput, pickBestMetadataMatch, scoreMetadataCandidate } from './metadataMatcher';
import type { LibraryTitle } from '../types';

const baseTitle: LibraryTitle = {
  id: 't1',
  canonicalTitle: 'Steins Gate',
  displayTitle: 'Steins Gate',
  year: 2011,
  mediaType: 'series',
  items: [],
  uniqueEpisodeCount: 24,
  totalFileCount: 24,
  duplicateVersionCount: 0,
  confidence: 1,
  source: 'local-parser',
};

describe('metadataMatcher', () => {
  it('scores exact title matches highly', () => {
    const input = buildTitleMatchInput(baseTitle);
    const score = scoreMetadataCandidate(input, {
      providerId: 'anilist',
      providerMediaId: '9253',
      title: 'Steins Gate',
      year: 2011,
      kind: 'series',
      confidence: 0.5,
    });
    expect(score).toBeGreaterThan(0.85);
  });

  it('penalizes movie match for OVA local type', () => {
    const ovaTitle: LibraryTitle = { ...baseTitle, mediaType: 'ova', uniqueEpisodeCount: 1, totalFileCount: 1 };
    const input = buildTitleMatchInput(ovaTitle);
    const score = scoreMetadataCandidate(input, {
      providerId: 'anilist',
      providerMediaId: '99',
      title: 'Higurashi Kaku',
      year: 2011,
      kind: 'movie',
      confidence: 0.55,
    });
    expect(score).toBeLessThan(0.72);
  });

  it('strips episode suffix from match query', () => {
    const seriesTitle: LibraryTitle = {
      ...baseTitle,
      canonicalTitle: 'Higurashi no Naku Koro ni Gou',
      displayTitle: 'Higurashi no Naku Koro ni Gou - Episode 02',
    };
    const input = buildTitleMatchInput(seriesTitle);
    expect(input.title).toBe('Higurashi: When They Cry – Gou');
    expect(input.aliases).toContain('Higurashi no Naku Koro ni Gou');
  });

  it('prefers Gou over Sotsu for Gou local title', () => {
    const gouTitle: LibraryTitle = {
      ...baseTitle,
      canonicalTitle: 'Higurashi no Naku Koro ni Gou',
      displayTitle: 'Higurashi no Naku Koro ni Gou',
    };
    const input = buildTitleMatchInput(gouTitle);
    const gouScore = scoreMetadataCandidate(input, {
      providerId: 'anilist',
      providerMediaId: 'gou',
      title: 'Higurashi no Naku Koro ni Gou',
      year: 2020,
      kind: 'anime',
      confidence: 0.5,
    });
    const sotsuScore = scoreMetadataCandidate(input, {
      providerId: 'anilist',
      providerMediaId: 'sotsu',
      title: 'Higurashi no Naku Koro ni Sotsu',
      year: 2021,
      kind: 'anime',
      confidence: 0.5,
    });
    expect(gouScore).toBeGreaterThan(sotsuScore);
  });

  it('prefers Sotsu over Kaku for Sotsu local title', () => {
    const sotsuTitle: LibraryTitle = {
      ...baseTitle,
      canonicalTitle: 'Higurashi no Naku Koro ni Sotsu',
      displayTitle: 'Higurashi no Naku Koro ni Sotsu',
    };
    const input = buildTitleMatchInput(sotsuTitle);
    const sotsuScore = scoreMetadataCandidate(input, {
      providerId: 'anilist',
      providerMediaId: 'sotsu',
      title: 'Higurashi: When They Cry – Sotsu',
      year: 2021,
      kind: 'anime',
      confidence: 0.5,
    });
    const kakuScore = scoreMetadataCandidate(input, {
      providerId: 'anilist',
      providerMediaId: 'kaku',
      title: 'Higurashi no Naku Koro ni Kaku: Outbreak',
      year: 2011,
      kind: 'anime',
      confidence: 0.5,
    });
    expect(sotsuScore).toBeGreaterThan(kakuScore);
  });

  it('rejects low-confidence unrelated matches', () => {
    const input = buildTitleMatchInput(baseTitle);
    const result = pickBestMetadataMatch(input, [{
      providerId: 'anilist',
      providerMediaId: '1',
      title: 'Totally Different Show',
      year: 1999,
      kind: 'movie',
      confidence: 0.4,
    }]);
    expect(result.best).toBeUndefined();
    expect(result.confidence).toBeLessThan(0.72);
  });
});
