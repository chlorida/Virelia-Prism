import type { RelatedTitle } from '../../../../shared/titleMetadataTypes';

import type { LibraryTitle } from '../types';

import {

  isNonVideoRemoteFormat,

  normalizeFranchiseText,

  scoreCatalogToLibrary,

} from '../franchise/franchiseMatcher';

import { FRANCHISE_CATALOG } from '../franchise/franchiseCatalog';



const MATCH_MIN_CONFIDENCE = 0.78;

const ARC_TOKENS = ['gou', 'sotsu', 'kai', 'kaku', 'rei', 'reyou', 'matsuri', 'outbreak'] as const;



function arcTokensIn(norm: string): Set<string> {

  const found = new Set<string>();

  for (const token of ARC_TOKENS) {

    if (norm.includes(token)) found.add(token);

  }

  return found;

}



function titleAliases(title: LibraryTitle): string[] {

  const names = new Set<string>();

  for (const n of [title.canonicalTitle, title.displayTitle, title.localizedTitle]) {

    if (n?.trim()) names.add(n.trim());

  }

  return [...names];

}



function scoreSeasonDiscriminator(remoteNorm: string, localNorm: string): number {

  const remoteTags = arcTokensIn(remoteNorm);

  const localTags = arcTokensIn(localNorm);



  if (remoteTags.size > 0 && localTags.size === 0) return -0.42;

  if (remoteTags.size > 0 && localTags.size > 0) {

    let overlap = 0;

    for (const tag of remoteTags) {

      if (localTags.has(tag)) overlap += 1;

    }

    if (overlap === 0) return -0.48;

    if (overlap === remoteTags.size && overlap === localTags.size) return 0.18;

  }



  let delta = 0;

  for (const tag of ARC_TOKENS) {

    const remoteHas = remoteNorm.includes(tag);

    const localHas = localNorm.includes(tag);

    if (remoteHas && localHas) delta += 0.16;

    else if (remoteHas && !localHas) delta -= 0.24;

    else if (!remoteHas && localHas) delta -= 0.18;

  }

  return delta;

}



function scoreRelatedToLocal(related: RelatedTitle, local: LibraryTitle): number {

  if (isNonVideoRemoteFormat(related.format)) return 0;



  const candidates = [

    related.title,

    related.englishTitle,

    related.nativeTitle,

    related.romajiTitle,

  ].filter((v): v is string => Boolean(v?.trim()));



  const localNames = titleAliases(local);

  let score = 0.38;



  const tokenize = (value: string): Set<string> => {

    const tokens = normalizeFranchiseText(value).split(' ').filter((t) => t.length > 2);

    return new Set(tokens);

  };



  for (const remote of candidates) {

    const remoteNorm = normalizeFranchiseText(remote);

    for (const localName of localNames) {

      const localNorm = normalizeFranchiseText(localName);

      if (!remoteNorm || !localNorm) continue;

      if (remoteNorm === localNorm) score = Math.max(score, 0.92);

      else if (remoteNorm.includes(localNorm) || localNorm.includes(remoteNorm)) {

        score = Math.max(score, 0.76);

      }



      const remoteTokens = tokenize(remote);

      const localTokens = tokenize(localName);

      let shared = 0;

      for (const token of remoteTokens) {

        if (localTokens.has(token)) shared += 1;

      }

      if (shared > 0) {

        const overlap = shared / Math.max(remoteTokens.size, localTokens.size, 1);

        score = Math.max(score, 0.52 + overlap * 0.34);

      }



      score += scoreSeasonDiscriminator(remoteNorm, localNorm);

    }

  }



  if (related.year && local.year && related.year === local.year) score += 0.08;

  if (related.format && local.mediaType === 'movie' && related.format === 'MOVIE') score += 0.06;

  if (related.format && local.mediaType === 'series' && (related.format === 'TV' || related.format === 'TV_SHORT')) {

    score += 0.06;

  }

  if (related.format && (related.format === 'OVA' || related.format === 'SPECIAL')

    && (local.mediaType === 'ova' || local.mediaType === 'special' || local.mediaType === 'movie')) {

    score += 0.05;

  }



  for (const franchise of FRANCHISE_CATALOG) {

    for (const catalogTitle of franchise.titles) {

      const catalogScore = scoreCatalogToLibrary(catalogTitle, local);

      const remoteNorm = normalizeFranchiseText(related.title);

      const catalogNorm = normalizeFranchiseText(catalogTitle.displayTitle);

      if (catalogNorm && (remoteNorm === catalogNorm || remoteNorm.includes(catalogNorm) || catalogNorm.includes(remoteNorm))) {

        if (catalogScore >= MATCH_MIN_CONFIDENCE) score = Math.max(score, catalogScore);

        else score = Math.min(score, 0.55);

      }

    }

  }



  return Math.max(0, Math.min(1, score));

}



export function matchRelatedTitlesToLibrary(

  related: RelatedTitle[] | undefined,

  libraryTitles: LibraryTitle[]

): RelatedTitle[] {

  if (!related?.length || libraryTitles.length === 0) return related ?? [];



  return related.map((item) => {

    if (isNonVideoRemoteFormat(item.format)) {

      return { ...item, inLibrary: false, localTitleId: undefined, confidence: 0 };

    }



    let best: { title: LibraryTitle; confidence: number } | undefined;



    for (const local of libraryTitles) {

      const confidence = scoreRelatedToLocal(item, local);

      if (!best || confidence > best.confidence) {

        best = { title: local, confidence };

      }

    }



    if (!best || best.confidence < MATCH_MIN_CONFIDENCE) {

      return { ...item, inLibrary: false, localTitleId: undefined, confidence: best?.confidence };

    }



    return {

      ...item,

      inLibrary: true,

      localTitleId: best.title.id,

      confidence: best.confidence,

    };

  });

}



export function groupRelatedByType(

  related: RelatedTitle[]

): Array<{ type: RelatedTitle['relationType']; items: RelatedTitle[] }> {

  const order: RelatedTitle['relationType'][] = [

    'prequel',

    'sequel',

    'side_story',

    'spin_off',

    'parent',

    'summary',

    'alternative',

    'adaptation',

    'character',

    'recommendation',

    'other',

  ];



  const buckets = new Map<RelatedTitle['relationType'], RelatedTitle[]>();

  for (const item of related) {

    const list = buckets.get(item.relationType) ?? [];

    list.push(item);

    buckets.set(item.relationType, list);

  }



  return order

    .filter((type) => (buckets.get(type)?.length ?? 0) > 0)

    .map((type) => ({ type, items: buckets.get(type)! }));

}

