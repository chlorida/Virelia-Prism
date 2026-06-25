import type { TitleMediaAsset } from '../../../shared/titleMetadataTypes';
import type { MediaItem } from '../../../shared/types';
import type { LibraryEpisode, LibraryTitle } from './types';
import { resolveEpisodePlayItem } from './titlePlaybackService';
import { ensureThumbnail } from './thumbnailService';
import { captureVideoFramesAtRatios } from './thumbnailFrameCapture';

export const TARGET_SCREENSHOT_COUNT = 8;
const FRAME_CONCURRENCY = 2;

function hashToUnit(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}

function spreadSeekRatios(seed: string, count: number): number[] {
  if (count <= 0) return [];
  const ratios: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.35 : i / (count - 1);
    const base = 0.05 + t * 0.88;
    const jitter = (hashToUnit(`${seed}:${i}`) - 0.5) * 0.06;
    ratios.push(Math.min(0.93, Math.max(0.04, base + jitter)));
  }
  return ratios;
}

type FrameSource = {
  item: MediaItem;
  episodeNumber?: number;
};

type FrameAssignment = {
  item: MediaItem;
  ratio: number;
  slot: number;
  episodeNumber?: number;
};

function isMultiEpisodeSeries(title: LibraryTitle): boolean {
  return title.mediaType === 'series' && title.uniqueEpisodeCount > 1;
}

function sortEpisodes(episodes: LibraryEpisode[]): LibraryEpisode[] {
  return [...episodes].sort((a, b) => {
    const sa = a.seasonNumber ?? 0;
    const sb = b.seasonNumber ?? 0;
    if (sa !== sb) return sa - sb;
    return (a.episodeNumber ?? 9999) - (b.episodeNumber ?? 9999);
  });
}

function resolvePrimaryVideoItem(title: LibraryTitle): MediaItem | undefined {
  if (title.preferredItemId) {
    const preferred = title.items.find((item) => item.id === title.preferredItemId);
    if (preferred?.kind === 'video') return preferred;
  }
  return title.items.find((item) => item.kind === 'video');
}

function collectFrameSources(title: LibraryTitle): FrameSource[] {
  if (isMultiEpisodeSeries(title)) {
    return sortEpisodes(title.episodes ?? []).flatMap((episode) => {
      const item = resolveEpisodePlayItem(title, episode.id);
      return item ? [{ item, episodeNumber: episode.episodeNumber }] : [];
    });
  }

  const item = resolvePrimaryVideoItem(title);
  return item ? [{ item }] : [];
}

function buildFrameAssignments(title: LibraryTitle, maxFrames: number): FrameAssignment[] {
  const sources = collectFrameSources(title);
  if (sources.length === 0) return [];

  const assignments: FrameAssignment[] = [];
  const spreadAcrossSources = sources.length >= maxFrames;

  for (let i = 0; i < maxFrames; i += 1) {
    let sourceIdx: number;
    let frameInSource: number;

    if (spreadAcrossSources) {
      sourceIdx = Math.round((i * (sources.length - 1)) / (maxFrames - 1));
      frameInSource = 0;
    } else {
      sourceIdx = i % sources.length;
      frameInSource = Math.floor(i / sources.length);
    }

    const source = sources[sourceIdx]!;
    const framesPerSource = spreadAcrossSources ? 1 : Math.ceil(maxFrames / sources.length);
    const ratio = spreadSeekRatios(source.item.id, framesPerSource)[frameInSource % framesPerSource]!;

    assignments.push({
      item: source.item,
      ratio,
      slot: i,
      episodeNumber: source.episodeNumber,
    });
  }

  return assignments;
}

function toMediaAsset(
  item: MediaItem,
  displayUrl: string,
  slot: number,
  episodeNumber?: number
): TitleMediaAsset {
  return {
    id: `local-frame-${item.id}-${slot}`,
    kind: 'localFrame',
    source: 'local',
    displayUrl,
    episodeNumber,
    label: episodeNumber != null
      ? `Episode ${String(episodeNumber).padStart(2, '0')}`
      : undefined,
  };
}

async function captureAssignments(assignments: FrameAssignment[]): Promise<TitleMediaAsset[]> {
  const byItem = new Map<string, {
    item: MediaItem;
    slots: Array<{ ratio: number; slot: number; episodeNumber?: number }>;
  }>();

  for (const assignment of assignments) {
    const group = byItem.get(assignment.item.id) ?? { item: assignment.item, slots: [] };
    group.slots.push({
      ratio: assignment.ratio,
      slot: assignment.slot,
      episodeNumber: assignment.episodeNumber,
    });
    byItem.set(assignment.item.id, group);
  }

  const groups = [...byItem.values()];
  const results: TitleMediaAsset[] = [];
  const usedDisplayUrls = new Set<string>();
  let groupIndex = 0;

  async function worker(): Promise<void> {
    while (groupIndex < groups.length) {
      const current = groupIndex;
      groupIndex += 1;
      const group = groups[current]!;
      const ratios = group.slots.map((slot) => slot.ratio);
      const frames = await captureVideoFramesAtRatios(group.item, ratios);
      let fallbackThumb: string | undefined;

      for (let i = 0; i < group.slots.length; i += 1) {
        const slotInfo = group.slots[i]!;
        let displayUrl = frames[i];
        if (!displayUrl) {
          if (!fallbackThumb) {
            const thumb = await ensureThumbnail(group.item, 'high');
            fallbackThumb = thumb.status === 'ready' ? (thumb.largeUrl ?? thumb.url) : undefined;
          }
          displayUrl = fallbackThumb;
        }
        if (!displayUrl || usedDisplayUrls.has(displayUrl)) continue;
        usedDisplayUrls.add(displayUrl);
        results.push(toMediaAsset(group.item, displayUrl, slotInfo.slot, slotInfo.episodeNumber));
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(FRAME_CONCURRENCY, groups.length) }, () => worker())
  );

  return results.sort((a, b) => {
    const slotA = Number(a.id.split('-').pop() ?? 0);
    const slotB = Number(b.id.split('-').pop() ?? 0);
    return slotA - slotB;
  });
}

export async function buildLocalEpisodeFrames(
  title: LibraryTitle,
  maxFrames = TARGET_SCREENSHOT_COUNT
): Promise<TitleMediaAsset[]> {
  const assignments = buildFrameAssignments(title, maxFrames);
  if (assignments.length === 0) return [];
  return captureAssignments(assignments);
}
