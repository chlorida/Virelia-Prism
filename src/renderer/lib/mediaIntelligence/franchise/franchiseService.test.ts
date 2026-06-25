import { describe, expect, it } from 'vitest';
import type { LibraryTitle } from '../types';
import {
  buildFranchiseHubView,
  buildFranchiseTitleContext,
  searchFranchises,
} from './franchiseService';
import { matchCatalogTitleToLibrary } from './franchiseMatcher';
import { getFranchiseCatalogEntry } from './franchiseCatalog';

const gouLocal: LibraryTitle = {
  id: 'series:gou',
  canonicalTitle: 'Higurashi no Naku Koro ni Gou',
  displayTitle: 'Higurashi: When They Cry – Gou',
  year: 2020,
  mediaType: 'series',
  franchiseId: 'higurashi',
  items: [{
    id: 'f1',
    kind: 'video',
    filePath: 'D:/gou/01.mkv',
    fileName: '01.mkv',
    folder: 'D:/gou',
    title: 'Ep 01',
    tags: [],
    addedAt: '2024-01-01',
    favorite: false,
  }],
  uniqueEpisodeCount: 15,
  totalFileCount: 15,
  duplicateVersionCount: 0,
  confidence: 1,
  source: 'local-parser',
};

describe('franchiseService', () => {
  it('matches gou locally but not rei', () => {
    const franchise = getFranchiseCatalogEntry('higurashi');
    const gou = franchise!.titles.find((title) => title.catalogTitleId === 'higurashi-gou')!;
    const rei = franchise!.titles.find((title) => title.catalogTitleId === 'higurashi-rei')!;

    expect(matchCatalogTitleToLibrary(gou, [gouLocal]).localTitle?.id).toBe('series:gou');
    expect(matchCatalogTitleToLibrary(rei, [gouLocal]).localTitle).toBeUndefined();
  });

  it('builds before/after sections for gou', () => {
    const context = buildFranchiseTitleContext(gouLocal, [gouLocal], 'release');
    expect(context?.current?.catalogTitle.catalogTitleId).toBe('higurashi-gou');
    expect(context?.before.some((entry) => entry.catalogTitle.catalogTitleId === 'higurashi-rei')).toBe(true);
    expect(context?.after.some((entry) => entry.catalogTitle.catalogTitleId === 'higurashi-sotsu')).toBe(true);
  });

  it('finds franchise in search', () => {
    const results = searchFranchises('higurashi', [gouLocal]);
    expect(results.some((entry) => entry.franchise.franchiseId === 'higurashi')).toBe(true);
  });

  it('orders hub titles by release date by default', () => {
    const hub = buildFranchiseHubView('higurashi', [gouLocal], 'release');
    expect(hub?.titles[0]?.catalogTitle.catalogTitleId).toBe('higurashi-onikakushi');
    expect(hub?.localCount).toBe(1);
  });
});
