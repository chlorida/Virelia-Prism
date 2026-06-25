import type { MediaItem } from '../../../shared/types';
import type { MediaDisplayLanguage } from './languageResolution';
import { findRelatedFranchiseVideos } from './franchiseGrouping';
import { getCachedParsedIdentity } from './mediaIdentityCache';
import { buildMediaDisplayIdentity } from './mediaIdentityService';
import { parseMediaIdentity, normalizeSeriesKey } from './episodeParser';
import { detectSeriesInFolder, findNextEpisodeInSeries } from './seriesGrouping';
import { isRecommendableLocalItem } from './playableMediaFilter';
import {
  buildLibraryTitles,
  findLibraryEpisodeByItemId,
  findLibraryTitleByMediaId,
} from './libraryTitleService';
import { filterBrowsableLibraryTitles } from './libraryTitleFilters';
import { resolveEpisodePlayItem, resolveTitlePlayTarget } from './titlePlaybackService';
import type {
  ParsedMediaIdentity,
  SmartUpNextEntry,
  SmartUpNextPlan,
  SmartUpNextSection,
  UpNextSectionId,
  LibraryTitle,
} from './types';

const SCORE = {
  nextEpisode: 150,
  thisSeason: 130,
  sameSeries: 128,
  sameFolder: 75,
  relatedSeason: 110,
  unfinished: 90,
  alsoFromLibrary: 25,
  audioFallback: 10,
  watchedFull: -100,
} as const;

function isMostlyWatched(item: MediaItem): boolean {
  if (!item.durationSeconds || !item.resumePositionSeconds) return false;
  return item.resumePositionSeconds / item.durationSeconds > 0.92;
}

function candidateKey(itemId: string, section: UpNextSectionId): string {
  return `${itemId}::${section}`;
}

function pushCandidate(
  map: Map<string, SmartUpNextEntry>,
  item: MediaItem,
  currentId: string,
  section: UpNextSectionId,
  score: number,
  reason: string,
  language?: MediaDisplayLanguage,
  franchiseLabel?: string
): void {
  if (!isRecommendableLocalItem(item, currentId)) return;

  const display = buildMediaDisplayIdentity(item, language);
  const identity = display.parsed;
  const key = candidateKey(item.id, section);
  const existing = map.get(key);
  if (existing && existing.score >= score) {
    if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    return;
  }
  map.set(key, {
    item,
    section,
    score,
    reasons: [reason],
    identity,
    franchiseLabel,
    source: 'local-library',
  });
}

function sectionEntries(
  map: Map<string, SmartUpNextEntry>,
  section: UpNextSectionId,
  limit: number
): SmartUpNextEntry[] {
  return [...map.values()]
    .filter((e) => e.section === section)
    .sort((a, b) => {
      const epA = a.identity.episodeNumber ?? 9999;
      const epB = b.identity.episodeNumber ?? 9999;
      if (
        section === 'thisSeason'
        || section === 'sameSeries'
        || section === 'sameFolder'
        || section === 'nextEpisode'
      ) {
        if (epA !== epB) return epA - epB;
      }
      if (section === 'relatedSeason') {
        const labelA = a.franchiseLabel ?? a.identity.displayTitle ?? '';
        const labelB = b.franchiseLabel ?? b.identity.displayTitle ?? '';
        const byLabel = labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
        if (byLabel !== 0) return byLabel;
      }
      return b.score - a.score;
    })
    .slice(0, limit);
}

function findLibraryTitleForArcKey(
  libraryTitles: LibraryTitle[],
  arcKey: string,
  franchiseId: string
): LibraryTitle | undefined {
  return libraryTitles.find((title) => {
    if (title.franchiseId !== franchiseId) return false;
    return title.items.some((item) => {
      const identity = parseMediaIdentity(item.title, item.fileName);
      return normalizeSeriesKey(identity) === arcKey;
    });
  });
}

function pushRelatedFranchiseCandidates(
  map: Map<string, SmartUpNextEntry>,
  current: MediaItem,
  catalogItems: MediaItem[],
  libraryTitles: LibraryTitle[],
  currentLibraryTitleId: string | undefined,
  language: MediaDisplayLanguage
): void {
  const hints = findRelatedFranchiseVideos(current, catalogItems, language);
  const byArc = new Map<string, (typeof hints)[number]>();
  for (const hint of hints) {
    if (!byArc.has(hint.arcKey)) byArc.set(hint.arcKey, hint);
  }

  for (const hint of byArc.values()) {
    const matchingTitle = findLibraryTitleForArcKey(
      libraryTitles,
      hint.arcKey,
      hint.franchiseId
    );
    if (matchingTitle?.id === currentLibraryTitleId) continue;

    const playTarget = matchingTitle ? resolveTitlePlayTarget(matchingTitle) : undefined;
    const item = playTarget?.item ?? hint.item;
    const franchiseLabel = matchingTitle?.displayTitle ?? hint.franchiseLabel;

    pushCandidate(
      map,
      item,
      current.id,
      'relatedSeason',
      SCORE.relatedSeason,
      'relatedSeason',
      language,
      franchiseLabel
    );
  }
}

export function buildSmartUpNextPlan(
  current: MediaItem | undefined,
  catalogItems: MediaItem[],
  historyItems: MediaItem[],
  language: MediaDisplayLanguage = 'en'
): SmartUpNextPlan {
  if (!current) {
    return { currentIdentity: null, displayIdentity: null, series: null, hero: null, sections: [] };
  }

  const currentIdentity = getCachedParsedIdentity(current);
  const displayIdentity = buildMediaDisplayIdentity(current, language);

  const pool = catalogItems.filter((i) => isRecommendableLocalItem(i, current.id));
  const folderVideos = pool.filter((i) => i.kind === 'video' && i.folder === current.folder);
  const series = current.kind === 'video'
    ? detectSeriesInFolder(current, [...folderVideos, current], language)
    : null;
  const libraryTitles = filterBrowsableLibraryTitles(buildLibraryTitles(catalogItems, language));
  const libraryTitle = findLibraryTitleByMediaId(libraryTitles, current.id);
  const libraryEpisode = libraryTitle ? findLibraryEpisodeByItemId(libraryTitle, current.id) : undefined;
  const currentEpisodeNumber = libraryEpisode?.episodeNumber ?? currentIdentity.episodeNumber;

  const map = new Map<string, SmartUpNextEntry>();

  if (current.kind === 'video') {
    if (libraryTitle?.episodes && libraryTitle.episodes.length > 0 && currentEpisodeNumber != null) {
      const nextLibraryEpisode = [...libraryTitle.episodes]
        .filter((ep) => ep.episodeNumber != null && ep.episodeNumber > currentEpisodeNumber)
        .sort((a, b) => (a.episodeNumber ?? 9999) - (b.episodeNumber ?? 9999))[0];
      if (nextLibraryEpisode) {
        const nextItem = resolveEpisodePlayItem(libraryTitle, nextLibraryEpisode.id);
        if (nextItem) {
          pushCandidate(map, nextItem, current.id, 'nextEpisode', SCORE.nextEpisode, 'nextEpisode', language);
        }
      }

      for (const ep of libraryTitle.episodes) {
        if (ep.episodeNumber == null || ep.episodeNumber <= currentEpisodeNumber) continue;
        const item = resolveEpisodePlayItem(libraryTitle, ep.id);
        if (!item || item.id === current.id) continue;
        pushCandidate(map, item, current.id, 'sameSeries', SCORE.sameSeries, 'sameSeries', language);
        if ((ep.seasonNumber ?? 0) === (libraryEpisode?.seasonNumber ?? currentIdentity.seasonNumber ?? 0)) {
          pushCandidate(map, item, current.id, 'thisSeason', SCORE.thisSeason, 'thisSeason', language);
        }
      }
    }

    const nextEp = series ? findNextEpisodeInSeries(current, series) : undefined;
    if (nextEp && !map.has(candidateKey(nextEp.id, 'nextEpisode'))) {
      pushCandidate(map, nextEp, current.id, 'nextEpisode', SCORE.nextEpisode, 'nextEpisode', language);
    }
    if (sectionEntries(map, 'nextEpisode', 1).length === 0) {
      const seq = findSequentialFileNext(current, folderVideos);
      if (seq) pushCandidate(map, seq, current.id, 'nextEpisode', SCORE.nextEpisode, 'sequence', language);
    }

    if (series) {
      const currentEp = currentIdentity.episodeNumber;
      const currentSeason = currentIdentity.seasonNumber ?? 0;
      const seasonEpisodes = [...series.episodes].sort((a, b) => {
        const sa = a.seasonNumber ?? 0;
        const sb = b.seasonNumber ?? 0;
        if (sa !== sb) return sa - sb;
        return (a.episodeNumber ?? 9999) - (b.episodeNumber ?? 9999);
      });

      const seenEpisodeNums = new Set<number>();
      for (const ep of seasonEpisodes) {
        const item = series.items.find((it) => it.id === ep.mediaItemId);
        if (!item || item.id === current.id) continue;
        const itemIdentity = parseMediaIdentity(item.title, item.fileName);
        if (itemIdentity.isSpecial) continue;
        if (currentEp != null) {
          if (itemIdentity.episodeNumber == null) continue;
          if ((itemIdentity.seasonNumber ?? 0) !== currentSeason) continue;
          if (itemIdentity.episodeNumber <= currentEp) continue;
          if (seenEpisodeNums.has(itemIdentity.episodeNumber)) continue;
          seenEpisodeNums.add(itemIdentity.episodeNumber);
        }
        pushCandidate(map, item, current.id, 'thisSeason', SCORE.thisSeason, 'thisSeason', language);
      }
    }

    for (const item of folderVideos) {
      if (series?.items.some((i) => i.id === item.id)) continue;
      const itemIdentity = parseMediaIdentity(item.title, item.fileName);
      if (
        currentEpisodeNumber != null
        && itemIdentity.episodeNumber != null
        && itemIdentity.episodeNumber <= currentEpisodeNumber
      ) {
        continue;
      }
      pushCandidate(map, item, current.id, 'sameFolder', SCORE.sameFolder, 'sameFolder', language);
    }

    pushRelatedFranchiseCandidates(
      map,
      current,
      catalogItems,
      libraryTitles,
      libraryTitle?.id,
      language
    );

    const unfinishedSources = [...folderVideos, ...historyItems.filter((i) => i.kind === 'video')];
    for (const item of unfinishedSources) {
      if ((item.resumePositionSeconds ?? 0) > 30 && !isMostlyWatched(item)) {
        pushCandidate(map, item, current.id, 'continueWatching', SCORE.unfinished, 'unfinished', language);
      }
    }

    for (const title of libraryTitles) {
      if (title.id === libraryTitle?.id) continue;
      if (
        title.franchiseId
        && (title.franchiseId === libraryTitle?.franchiseId
          || title.franchiseId === currentIdentity.franchiseId)
      ) {
        continue;
      }
      if (title.items.every((item) => item.kind === 'audio')) continue;
      const target = resolveTitlePlayTarget(title);
      if (!target?.item) continue;
      pushCandidate(
        map,
        target.item,
        current.id,
        'alsoFromLibrary',
        SCORE.alsoFromLibrary + 4,
        'libraryTitle',
        language
      );
      if (sectionEntries(map, 'alsoFromLibrary', 16).length >= 10) break;
    }

    for (const item of historyItems.filter((i) => i.kind === 'video')) {
      if (!findLibraryTitleByMediaId(libraryTitles, item.id)) continue;
      pushCandidate(map, item, current.id, 'alsoFromLibrary', SCORE.alsoFromLibrary, 'history', language);
    }

    for (const item of pool.filter((i) => i.kind === 'audio' && i.folder === current.folder)) {
      pushCandidate(map, item, current.id, 'audioFallback', SCORE.audioFallback, 'audio', language);
    }

    for (const item of pool.filter((i) => i.kind === 'audio')) {
      pushCandidate(map, item, current.id, 'audioFallback', SCORE.audioFallback - 2, 'audio', language);
    }
  } else {
    for (const item of pool.filter((i) => i.folder === current.folder)) {
      pushCandidate(map, item, current.id, 'sameFolder', SCORE.sameFolder, 'sameFolder', language);
    }
    for (const item of historyItems) {
      pushCandidate(map, item, current.id, 'alsoFromLibrary', SCORE.alsoFromLibrary, 'history', language);
    }
  }

  for (const entry of map.values()) {
    if (isMostlyWatched(entry.item) && entry.section !== 'continueWatching') {
      entry.score += SCORE.watchedFull;
    }
  }

  const hasSeriesContext = (libraryTitle?.uniqueEpisodeCount ?? 0) > 1
    || (libraryTitle?.episodes?.length ?? 0) > 1;
  const hasFranchiseContext = Boolean(
    libraryTitle?.franchiseId
    || currentIdentity.franchiseId
    || sectionEntries(map, 'relatedSeason', 1).length > 0
  );

  const hero = sectionEntries(map, 'nextEpisode', 1)[0]
    ?? sectionEntries(map, 'thisSeason', 1)[0]
    ?? sectionEntries(map, 'sameSeries', 1)[0]
    ?? (!hasSeriesContext && !hasFranchiseContext ? sectionEntries(map, 'sameFolder', 1)[0] : null)
    ?? null;

  const hasVideoSections = () =>
    sectionEntries(map, 'thisSeason', 1).length > 0
    || sectionEntries(map, 'sameSeries', 1).length > 0
    || sectionEntries(map, 'sameFolder', 1).length > 0;

  const sectionOrder: { id: UpNextSectionId; key: string; limit: number }[] = [
    { id: 'thisSeason', key: 'smartPanel.section.thisSeason', limit: 6 },
    { id: 'sameSeries', key: 'smartPanel.section.sameSeries', limit: 6 },
    { id: 'relatedSeason', key: 'smartPanel.section.relatedSeason', limit: 4 },
    { id: 'continueWatching', key: 'smartPanel.section.continueWatching', limit: 4 },
    { id: 'sameFolder', key: 'smartPanel.section.sameFolder', limit: 5 },
    { id: 'alsoFromLibrary', key: 'smartPanel.section.alsoFromLibrary', limit: 6 },
    { id: 'audioFallback', key: 'smartPanel.section.audioFallback', limit: 4 },
  ];

  const heroItemId = hero?.item.id;
  const sections: SmartUpNextSection[] = [];
  for (const spec of sectionOrder) {
    const entries = sectionEntries(map, spec.id, spec.limit)
      .filter((entry) => entry.item.id !== heroItemId);
    if (entries.length === 0) continue;
    sections.push({ id: spec.id, labelKey: spec.key, entries });
  }

  let episodeIndex: number | undefined;
  let episodeCount: number | undefined;
  const folderEpisodeNumbers = folderVideos
    .map((item) => parseMediaIdentity(item.title, item.fileName).episodeNumber)
    .filter((value): value is number => value != null);
  const maxFolderEpisode = folderEpisodeNumbers.length > 0
    ? Math.max(...folderEpisodeNumbers)
    : 0;
  const seriesEpisodeCount = series?.episodes.length ?? 0;
  const libraryEpisodeCount = libraryTitle?.uniqueEpisodeCount ?? 0;

  if (currentEpisodeNumber != null) {
    episodeIndex = currentEpisodeNumber;
    episodeCount = Math.max(libraryEpisodeCount, seriesEpisodeCount, maxFolderEpisode);
  } else {
    const folderEpisodeIndex = series?.episodes.findIndex((e) => e.mediaItemId === current.id);
    episodeIndex = folderEpisodeIndex != null && folderEpisodeIndex >= 0
      ? folderEpisodeIndex + 1
      : currentIdentity.episodeNumber ?? undefined;
    episodeCount = series?.episodes.length;
  }

  return {
    currentIdentity,
    displayIdentity,
    series,
    hero,
    sections,
    episodeIndex: episodeIndex != null && episodeIndex >= 0 ? episodeIndex : undefined,
    episodeCount,
  };
}

function findSequentialFileNext(current: MediaItem, folderVideos: MediaItem[]): MediaItem | undefined {
  const currentId = parseMediaIdentity(current.title, current.fileName);
  if (currentId.episodeNumber != null) {
    const nextNum = currentId.episodeNumber + 1;
    const padded = String(nextNum).padStart(2, '0');
    const found = folderVideos.find((item) => {
      const id = parseMediaIdentity(item.title, item.fileName);
      if (id.episodeNumber === nextNum) return true;
      return item.fileName.includes(`[${padded}]`) || item.fileName.includes(`[${nextNum}]`);
    });
    if (found) return found;
  }

  const base = current.fileName.replace(/\.[^.]+$/, '');
  const match = base.match(/^(.*?)(\d+)$/);
  if (!match) return undefined;
  const prefix = match[1];
  const num = Number.parseInt(match[2], 10);
  const nextName = `${prefix}${String(num + 1).padStart(match[2].length, '0')}`;
  return folderVideos.find((item) => {
    const b = item.fileName.replace(/\.[^.]+$/, '');
    return b === nextName || b.startsWith(nextName);
  });
}
