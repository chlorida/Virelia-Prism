import type { MediaItem } from '../../../shared/types';

import type { EpisodeItem, ParsedMediaIdentity, SeriesGroup } from './types';

import { isSpecialMedia, normalizeSeriesKey, parseMediaIdentity } from './episodeParser';

import { getParsedIdentity } from './mediaIdentityService';

import { pickBestVersionItem } from './episodeVersionService';



export function naturalCompare(a: string, b: string): number {

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

}



function episodeSortKey(ep: EpisodeItem): [number, number, string] {

  return [ep.seasonNumber ?? 0, ep.episodeNumber ?? 9999, ep.fileName];

}



function episodeIdentityKey(ep: EpisodeItem): string {

  return `s${ep.seasonNumber ?? 0}:e${ep.episodeNumber ?? 'unk'}`;

}



function dedupeEpisodeItems(episodes: EpisodeItem[], items: MediaItem[]): EpisodeItem[] {

  const byKey = new Map<string, EpisodeItem[]>();

  for (const ep of episodes) {

    const key = episodeIdentityKey(ep);

    const bucket = byKey.get(key) ?? [];

    bucket.push(ep);

    byKey.set(key, bucket);

  }



  const deduped: EpisodeItem[] = [];

  for (const [, group] of byKey) {

    if (group.length === 1) {

      deduped.push(group[0]!);

      continue;

    }

    const mediaItems = group

      .map((ep) => items.find((item) => item.id === ep.mediaItemId))

      .filter((item): item is MediaItem => Boolean(item));

    const preferred = pickBestVersionItem(mediaItems);

    const chosen = group.find((ep) => ep.mediaItemId === preferred?.id) ?? group[0]!;

    deduped.push(chosen);

  }



  deduped.sort((a, b) => {

    const ka = episodeSortKey(a);

    const kb = episodeSortKey(b);

    if (ka[0] !== kb[0]) return ka[0] - kb[0];

    if (ka[1] !== kb[1]) return ka[1] - kb[1];

    return naturalCompare(ka[2], kb[2]);

  });



  return deduped;

}



export function buildSeriesGroup(

  seriesKey: string,

  folderPath: string | undefined,

  items: MediaItem[],

  language?: string

): SeriesGroup {

  const rawEpisodes: EpisodeItem[] = items

    .filter((item) => !isSpecialMedia(getParsedIdentity(item, language)))

    .map((item) => {

    const identity = getParsedIdentity(item, language);

    return {

      mediaItemId: item.id,

      seasonNumber: identity.seasonNumber,

      episodeNumber: identity.episodeNumber,

      title: identity.displayTitle,

      displayTitle: formatEpisodeLabel(identity, language),

      fileName: item.fileName,

      durationSeconds: item.durationSeconds,

      resumePositionSeconds: item.resumePositionSeconds,

    };

  });



  const episodes = dedupeEpisodeItems(rawEpisodes, items);



  const first = items[0] ? parseMediaIdentity(items[0].title, items[0].fileName) : null;



  return {

    id: `${folderPath ?? 'global'}::${seriesKey}`,

    title: first?.probableSeriesTitle ?? seriesKey,

    localizedTitle: first?.localizedTitle,

    folderPath,

    items,

    episodes,

    confidence: episodes.filter((e) => e.episodeNumber != null).length >= 2 ? 0.85 : 0.55,

  };

}



export function formatEpisodeLabel(identity: ParsedMediaIdentity, language?: string): string {

  const title = identity.localizedTitle ?? identity.displayTitle;

  if (identity.episodeNumber == null) return title;

  const ep = String(identity.episodeNumber).padStart(2, '0');

  if (language === 'ru') return `${title} · серия ${ep}`;

  return `${title} · E${ep}`;

}



export function detectSeriesInFolder(

  current: MediaItem,

  folderVideos: MediaItem[],

  language?: string

): SeriesGroup | null {

  if (folderVideos.length < 2) return null;

  const currentIdentity = parseMediaIdentity(current.title, current.fileName);

  const key = normalizeSeriesKey(currentIdentity);



  const matched = folderVideos.filter((item) => {

    const id = parseMediaIdentity(item.title, item.fileName);

    if (isSpecialMedia(id)) return false;

    const itemKey = normalizeSeriesKey(id);

    return itemKey === key;

  });



  const pool = matched.length >= 2

    ? matched

    : matched.length === 1

      ? [current, ...matched.filter((item) => item.id !== current.id)]

      : [];



  if (pool.length < 2) return null;

  return buildSeriesGroup(key, current.folder, pool, language);

}



export function findNextEpisodeInSeries(

  current: MediaItem,

  series: SeriesGroup

): MediaItem | undefined {

  const currentId = parseMediaIdentity(current.title, current.fileName);

  const ep = currentId.episodeNumber;

  const season = currentId.seasonNumber ?? 0;



  if (ep != null) {

    const candidates = series.episodes

      .filter(

        (entry) =>

          entry.episodeNumber != null

          && entry.episodeNumber > ep

          && (entry.seasonNumber ?? 0) === season

      )

      .sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));

    const next = candidates[0];

    if (next) return series.items.find((item) => item.id === next.mediaItemId);

    return undefined;

  }



  const idx = series.episodes.findIndex((entry) => entry.mediaItemId === current.id);

  if (idx >= 0 && idx < series.episodes.length - 1) {

    const nextId = series.episodes[idx + 1]!.mediaItemId;

    return series.items.find((item) => item.id === nextId);

  }

  return undefined;

}

