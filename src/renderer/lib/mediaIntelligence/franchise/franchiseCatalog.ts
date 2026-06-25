export type FranchiseTitleType = 'movie' | 'series' | 'ova' | 'special';

export type FranchiseWatchOrderMode = 'release' | 'recommended' | 'chronological';

export interface FranchiseCatalogMatchRule {
  normalizedIncludes?: string[];
  normalizedEquals?: string[];
  year?: number;
  arcTokens?: string[];
  excludeArcTokens?: string[];
}

export interface FranchiseCatalogTitle {
  catalogTitleId: string;
  displayTitle: string;
  type: FranchiseTitleType;
  releaseDate: string;
  releaseOrderIndex: number;
  recommendedOrderIndex: number;
  chronologicalOrderIndex: number;
  aliases: string[];
  localMatchRules: FranchiseCatalogMatchRule[];
  description?: string;
  posterUrl?: string;
  /** Known AniList media id for automatic poster/metadata enrichment. */
  anilistMediaId?: number;
}

export interface FranchiseCatalogEntry {
  franchiseId: string;
  franchiseName: string;
  description?: string;
  posterUrl?: string;
  bannerUrl?: string;
  titles: FranchiseCatalogTitle[];
}

export const FRANCHISE_CATALOG: FranchiseCatalogEntry[] = [
  {
    franchiseId: 'higurashi',
    franchiseName: 'Higurashi: When They Cry',
    description: 'Mystery horror series spanning multiple seasons, OVAs, and reboot arcs.',
    posterUrl: undefined,
    titles: [
      {
        catalogTitleId: 'higurashi-onikakushi',
        displayTitle: 'Higurashi: When They Cry',
        type: 'series',
        releaseDate: '2006-04-04',
        releaseOrderIndex: 1,
        recommendedOrderIndex: 1,
        chronologicalOrderIndex: 1,
        aliases: [
          'higurashi no naku koro ni',
          'higurashi when they cry',
          'when they cry',
        ],
        localMatchRules: [{
          normalizedIncludes: ['higurashi'],
          excludeArcTokens: ['gou', 'sotsu', 'kai', 'rei', 'kaku', 'outbreak', 'matsuri'],
        }],
        anilistMediaId: 934,
      },
      {
        catalogTitleId: 'higurashi-kai',
        displayTitle: 'Higurashi: When They Cry – Kai',
        type: 'series',
        releaseDate: '2007-07-06',
        releaseOrderIndex: 2,
        recommendedOrderIndex: 2,
        chronologicalOrderIndex: 2,
        aliases: ['higurashi kai', 'higurashi no naku koro ni kai'],
        localMatchRules: [{ arcTokens: ['kai'], normalizedIncludes: ['higurashi'] }],
        anilistMediaId: 935,
      },
      {
        catalogTitleId: 'higurashi-rei',
        displayTitle: 'Higurashi: When They Cry – Rei',
        type: 'ova',
        releaseDate: '2009-02-25',
        releaseOrderIndex: 3,
        recommendedOrderIndex: 5,
        chronologicalOrderIndex: 6,
        aliases: ['higurashi rei', 'higurashi no naku koro ni rei', 'when they cry rei'],
        localMatchRules: [{ arcTokens: ['rei'], normalizedIncludes: ['higurashi'] }],
        anilistMediaId: 3654,
      },
      {
        catalogTitleId: 'higurashi-kaku',
        displayTitle: 'Higurashi: When They Cry – Outbreak',
        type: 'ova',
        releaseDate: '2013-08-22',
        releaseOrderIndex: 4,
        recommendedOrderIndex: 6,
        chronologicalOrderIndex: 5,
        aliases: ['higurashi kaku', 'higurashi outbreak', 'outbreak ova'],
        localMatchRules: [{
          arcTokens: ['kaku'],
          normalizedIncludes: ['higurashi'],
        }, {
          arcTokens: ['outbreak'],
          normalizedIncludes: ['higurashi'],
        }],
        anilistMediaId: 16700,
      },
      {
        catalogTitleId: 'higurashi-gou',
        displayTitle: 'Higurashi: When They Cry – Gou',
        type: 'series',
        releaseDate: '2020-10-01',
        releaseOrderIndex: 5,
        recommendedOrderIndex: 3,
        chronologicalOrderIndex: 3,
        aliases: ['higurashi gou', 'higurashi no naku koro ni gou'],
        localMatchRules: [{ arcTokens: ['gou'], normalizedIncludes: ['higurashi'] }],
        anilistMediaId: 114446,
      },
      {
        catalogTitleId: 'higurashi-sotsu',
        displayTitle: 'Higurashi: When They Cry – Sotsu',
        type: 'series',
        releaseDate: '2021-07-01',
        releaseOrderIndex: 6,
        recommendedOrderIndex: 4,
        chronologicalOrderIndex: 4,
        aliases: ['higurashi sotsu', 'higurashi no naku koro ni sotsu'],
        localMatchRules: [{ arcTokens: ['sotsu'], normalizedIncludes: ['higurashi'] }],
        anilistMediaId: 131573,
      },
    ],
  },
  {
    franchiseId: 'sonic',
    franchiseName: 'Sonic the Hedgehog',
    description: 'Adventures of Sonic across anime films and series.',
    titles: [
      {
        catalogTitleId: 'sonic-movie-1999',
        displayTitle: 'Sonic the Hedgehog: The Movie',
        type: 'movie',
        releaseDate: '1999-01-26',
        releaseOrderIndex: 1,
        recommendedOrderIndex: 1,
        chronologicalOrderIndex: 1,
        aliases: [
          'sonic the hedgehog the movie',
          'sonic the hedgehog movie',
          'sonic movie',
          'sonic ova',
        ],
        localMatchRules: [{
          normalizedIncludes: ['sonic'],
          excludeArcTokens: ['x', 'boom', 'prime'],
        }],
        anilistMediaId: 2263,
      },
      {
        catalogTitleId: 'sonic-x',
        displayTitle: 'Sonic X',
        type: 'series',
        releaseDate: '2003-04-06',
        releaseOrderIndex: 2,
        recommendedOrderIndex: 2,
        chronologicalOrderIndex: 3,
        aliases: ['sonic x'],
        localMatchRules: [{ arcTokens: ['x'], normalizedIncludes: ['sonic'] }],
        anilistMediaId: 1816,
      },
      {
        catalogTitleId: 'sonic-boom',
        displayTitle: 'Sonic Boom',
        type: 'series',
        releaseDate: '2014-11-08',
        releaseOrderIndex: 3,
        recommendedOrderIndex: 3,
        chronologicalOrderIndex: 2,
        aliases: ['sonic boom'],
        localMatchRules: [{ arcTokens: ['boom'], normalizedIncludes: ['sonic'] }],
        anilistMediaId: 20742,
      },
    ],
  },
];

export function getFranchiseCatalogEntry(franchiseId: string): FranchiseCatalogEntry | undefined {
  return FRANCHISE_CATALOG.find((entry) => entry.franchiseId === franchiseId);
}

export function getCatalogTitleById(catalogTitleId: string): FranchiseCatalogTitle | undefined {
  for (const franchise of FRANCHISE_CATALOG) {
    const title = franchise.titles.find((entry) => entry.catalogTitleId === catalogTitleId);
    if (title) return title;
  }
  return undefined;
}

export function orderIndexForMode(
  title: FranchiseCatalogTitle,
  mode: FranchiseWatchOrderMode
): number {
  if (mode === 'recommended') return title.recommendedOrderIndex;
  if (mode === 'chronological') return title.chronologicalOrderIndex;
  return title.releaseOrderIndex;
}
