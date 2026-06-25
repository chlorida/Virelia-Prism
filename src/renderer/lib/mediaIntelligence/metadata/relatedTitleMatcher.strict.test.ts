import { describe, expect, it } from 'vitest';
import type { RelatedTitle } from '../../../../shared/titleMetadataTypes';
import type { LibraryTitle } from '../types';
import { matchRelatedTitlesToLibrary } from './relatedTitleMatcher';

const gouLocal: LibraryTitle = {
  id: 'local-gou',
  canonicalTitle: 'Higurashi no Naku Koro ni Gou',
  displayTitle: 'Higurashi Gou',
  year: 2020,
  mediaType: 'series',
  franchiseId: 'higurashi',
  items: [],
  uniqueEpisodeCount: 15,
  totalFileCount: 15,
  duplicateVersionCount: 0,
  confidence: 1,
  source: 'local-parser',
};

describe('relatedTitleMatcher strict matching', () => {
  it('does not mark manga adaptations as in library', () => {
    const related: RelatedTitle[] = [{
      id: 'anilist-manga',
      provider: 'anilist',
      providerId: 99,
      title: 'Higurashi When They Cry: GOU',
      relationType: 'adaptation',
      format: 'MANGA',
      year: 2020,
    }];

    const matched = matchRelatedTitlesToLibrary(related, [gouLocal]);
    expect(matched[0]?.inLibrary).toBeFalsy();
  });

  it('does not match rei prequel when only gou exists locally', () => {
    const related: RelatedTitle[] = [{
      id: 'anilist-rei',
      provider: 'anilist',
      providerId: 43,
      title: 'Higurashi: When They Cry – Rei',
      relationType: 'prequel',
      format: 'OVA',
      year: 2009,
    }];

    const matched = matchRelatedTitlesToLibrary(related, [gouLocal]);
    expect(matched[0]?.inLibrary).toBeFalsy();
  });

  it('still matches the correct local arc', () => {
    const related: RelatedTitle[] = [{
      id: 'anilist-gou',
      provider: 'anilist',
      providerId: 1,
      title: 'Higurashi: When They Cry – Gou',
      relationType: 'sequel',
      format: 'TV',
      year: 2020,
    }];

    const matched = matchRelatedTitlesToLibrary(related, [gouLocal]);
    expect(matched[0]?.inLibrary).toBe(true);
    expect(matched[0]?.localTitleId).toBe('local-gou');
  });
});
