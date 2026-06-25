import type { LocalizedTitleMap } from './types';

export interface SeriesAliasEntry {
  /** Normalized match keys (substring match on series key). */
  keys: string[];
  titles: LocalizedTitleMap;
  /** Optional arc token in series key (gou, sotsu, kai). */
  arcTokens?: string[];
  franchiseId?: string;
  /** Known provider ids for direct lookup when search is ambiguous. */
  anilistId?: number;
  malId?: number;
}

/** Replaceable built-in aliases; provider metadata should override when available. */
export const SERIES_ALIAS_ENTRIES: SeriesAliasEntry[] = [
  {
    keys: ['higurashi no naku koro ni sotsu', 'higurashi sotsu', 'naku koro ni sotsu'],
    arcTokens: ['sotsu'],
    franchiseId: 'higurashi',
    titles: {
      en: 'Higurashi: When They Cry – Sotsu',
      ru: 'Когда плачут цикады: Сота',
      romaji: 'Higurashi no Naku Koro ni Sotsu',
      original: 'ひぐらしのなく頃に卒',
    },
  },
  {
    keys: ['higurashi no naku koro ni gou', 'higurashi gou'],
    arcTokens: ['gou'],
    franchiseId: 'higurashi',
    titles: {
      en: 'Higurashi: When They Cry – Gou',
      ru: 'Когда плачут цикады: Гоу',
      romaji: 'Higurashi no Naku Koro ni Gou',
      original: 'ひぐらしのなく頃に業',
    },
  },
  {
    keys: [
      'higurashi no naku koro ni kaku',
      'higurashi kaku',
      'naku koro ni kaku',
      'kaku outbreak',
      'outbreak ova',
    ],
    arcTokens: ['kaku', 'outbreak'],
    franchiseId: 'higurashi',
    titles: {
      en: 'Higurashi: When They Cry – Outbreak',
      romaji: 'Higurashi no Naku Koro ni Kaku',
      original: 'ひぐらしのなく頃に煌',
    },
    anilistId: 16700,
    malId: 17203,
  },
  {
    keys: ['higurashi no naku koro ni kai', 'higurashi kai'],
    arcTokens: ['kai'],
    franchiseId: 'higurashi',
    titles: {
      en: 'Higurashi: When They Cry – Kai',
      ru: 'Когда плачут цикады: Кай',
      romaji: 'Higurashi no Naku Koro ni Kai',
    },
  },
  {
    keys: ['higurashi no naku koro ni rei', 'higurashi rei'],
    arcTokens: ['rei'],
    franchiseId: 'higurashi',
    titles: {
      en: 'Higurashi: When They Cry – Rei',
      ru: 'Когда плачут цикады: Рей',
      romaji: 'Higurashi no Naku Koro ni Rei',
    },
  },
  {
    keys: ['higurashi no naku koro ni', 'higurashi when they cry'],
    franchiseId: 'higurashi',
    titles: {
      en: 'Higurashi: When They Cry',
      ru: 'Когда плачут цикады',
      romaji: 'Higurashi no Naku Koro ni',
    },
  },
];

/** Standalone movies / OVAs with noisy local filenames. */
export const WORK_ALIAS_ENTRIES: SeriesAliasEntry[] = [
  {
    keys: [
      'sonic the hedgehog the movie',
      'sonic the hedgehog movie',
      'sonic movie',
      'sonic ova',
    ],
    titles: {
      en: 'Sonic the Hedgehog: The Movie',
      romaji: 'Sonic the Hedgehog: The Movie',
    },
    anilistId: 2263,
    malId: 1380,
  },
];

export function findWorkAlias(titleKey: string): SeriesAliasEntry | undefined {
  const key = normalizeAliasKey(titleKey);
  if (!key || key.length < 4) return undefined;

  let best: SeriesAliasEntry | undefined;
  let bestLen = 0;
  for (const entry of WORK_ALIAS_ENTRIES) {
    for (const candidate of entry.keys) {
      const c = normalizeAliasKey(candidate);
      if (c.length < 4) continue;
      if (key.includes(c) || (key.length >= 6 && c.includes(key))) {
        if (c.length > bestLen) {
          best = entry;
          bestLen = c.length;
        }
      }
    }
  }
  return best;
}

export function normalizeAliasKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

export function findSeriesAlias(seriesKey: string): SeriesAliasEntry | undefined {
  const key = normalizeAliasKey(seriesKey);
  if (!key || key.length < 4) return undefined;

  const matches: Array<{ entry: SeriesAliasEntry; keyLen: number; arcHits: number }> = [];
  for (const entry of SERIES_ALIAS_ENTRIES) {
    for (const candidate of entry.keys) {
      const c = normalizeAliasKey(candidate);
      if (c.length < 4) continue;
      if (key.includes(c) || (key.length >= 4 && c.includes(key))) {
        const arcHits = (entry.arcTokens ?? []).filter((token) => key.includes(token)).length;
        matches.push({ entry, keyLen: c.length, arcHits });
      }
    }
  }
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => {
    if (b.arcHits !== a.arcHits) return b.arcHits - a.arcHits;
    return b.keyLen - a.keyLen;
  });
  return matches[0]?.entry;
}

export function getFranchiseId(seriesKey: string): string | undefined {
  const alias = findSeriesAlias(seriesKey);
  return alias?.franchiseId;
}
