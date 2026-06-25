import { describe, expect, it } from 'vitest';
import { resolveTitleDisplayType } from './titleDisplayUtils';
import type { LibraryTitle } from './types';

function stubTitle(overrides: Partial<LibraryTitle>): LibraryTitle {
  return {
    id: 't1',
    displayTitle: 'Test',
    mediaType: 'unknown',
    items: [],
    totalFileCount: 1,
    duplicateVersionCount: 0,
    uniqueEpisodeCount: 1,
    ...overrides,
  } as LibraryTitle;
}

describe('resolveTitleDisplayType', () => {
  it('prefers OVA hints over a loose movie classification', () => {
    const title = stubTitle({
      displayTitle: 'Higurashi no Naku Koro ni Kaku',
      mediaType: 'movie',
      versionTags: ['OVA'],
    });
    expect(resolveTitleDisplayType(title)).toBe('ova');
  });

  it('keeps true movies as movie', () => {
    const title = stubTitle({
      displayTitle: 'Sonic the Hedgehog: The Movie',
      mediaType: 'movie',
    });
    expect(resolveTitleDisplayType(title)).toBe('movie');
  });
});
