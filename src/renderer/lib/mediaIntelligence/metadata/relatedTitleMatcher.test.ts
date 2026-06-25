import { describe, expect, it } from 'vitest';
import type { RelatedTitle } from '../../../../shared/titleMetadataTypes';
import type { LibraryTitle } from '../types';
import { matchRelatedTitlesToLibrary } from './relatedTitleMatcher';

const baseLocal: LibraryTitle = {
  id: 'local-gou',
  canonicalTitle: 'Higurashi no Naku Koro ni Gou',
  displayTitle: 'Higurashi Gou',
  year: 2020,
  mediaType: 'series',
  items: [],
  uniqueEpisodeCount: 15,
  totalFileCount: 15,
  duplicateVersionCount: 0,
  confidence: 1,
  source: 'local-parser',
};

describe('relatedTitleMatcher', () => {
  it('marks local library matches', () => {
    const related: RelatedTitle[] = [{
      id: 'anilist-1',
      provider: 'anilist',
      providerId: 1,
      title: 'Higurashi: When They Cry – Gou',
      englishTitle: 'Higurashi: When They Cry – Gou',
      relationType: 'sequel',
      year: 2020,
      format: 'TV',
    }];

    const matched = matchRelatedTitlesToLibrary(related, [baseLocal]);
    expect(matched[0]?.inLibrary).toBe(true);
    expect(matched[0]?.localTitleId).toBe('local-gou');
  });

  it('does not force match on unrelated titles', () => {
    const related: RelatedTitle[] = [{
      id: 'anilist-9',
      provider: 'anilist',
      providerId: 9,
      title: 'Completely Different Anime',
      relationType: 'other',
      year: 1999,
    }];

    const matched = matchRelatedTitlesToLibrary(related, [baseLocal]);
    expect(matched[0]?.inLibrary).toBeFalsy();
  });
});
