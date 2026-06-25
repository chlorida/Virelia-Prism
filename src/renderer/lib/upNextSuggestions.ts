import type { MediaItem } from '../../shared/types';
import type { MediaDisplayLanguage } from './mediaIntelligence/languageResolution';
import { buildSmartUpNextPlan } from './mediaIntelligence/smartUpNextService';
/** @deprecated use SmartUpNextEntry */
export interface UpNextEntry {
  item: MediaItem;
  reasonKey: string;
}

export function pickHeroNext(
  current: MediaItem | undefined,
  visibleItems: MediaItem[]
): { item: MediaItem; reasonKey: string } | null {
  const hero = buildSmartUpNextPlan(current, visibleItems, [], undefined).hero;
  if (hero) return { item: hero.item, reasonKey: hero.section };
  if (current?.kind === 'video') {
    const nextVideo = visibleItems.find((i) => i.kind === 'video' && i.id !== current.id);
    if (nextVideo) return { item: nextVideo, reasonKey: 'video' };
  }
  const fallback = visibleItems.find((i) => i.id !== current?.id);
  return fallback ? { item: fallback, reasonKey: 'similar' } : null;
}

export function buildUpNextEntries(
  current: MediaItem | undefined,
  visibleItems: MediaItem[],
  historyItems: MediaItem[],
  language?: MediaDisplayLanguage
): UpNextEntry[] {
  const plan = buildSmartUpNextPlan(current, visibleItems, historyItems, language);
  const out: UpNextEntry[] = [];
  if (plan.hero) out.push({ item: plan.hero.item, reasonKey: plan.hero.section });
  for (const section of plan.sections) {
    for (const entry of section.entries) {
      out.push({ item: entry.item, reasonKey: entry.section });
    }
  }
  const videos = out.filter((e) => e.item.kind === 'video');
  const audios = out.filter((e) => e.item.kind === 'audio');
  return [...videos, ...audios];
}

export function partitionUpNextEntries(entries: UpNextEntry[]): {
  videos: UpNextEntry[];
  audios: UpNextEntry[];
} {
  const videos: UpNextEntry[] = [];
  const audios: UpNextEntry[] = [];
  for (const entry of entries) {
    if (entry.item.kind === 'video') videos.push(entry);
    else audios.push(entry);
  }
  return { videos, audios };
}

export function buildUpNextSuggestions(
  current: MediaItem | undefined,
  visibleItems: MediaItem[],
  historyItems: MediaItem[],
  _recentItems: MediaItem[]
): MediaItem[] {
  return buildUpNextEntries(current, visibleItems, historyItems).map((e) => e.item);
}

export function itemsInFolder(items: MediaItem[], folder: string | undefined): MediaItem[] {
  if (!folder) return [];
  return items.filter((item) => item.folder === folder);
}

export function shuffleItems(items: MediaItem[]): MediaItem[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export { buildSmartUpNextPlan } from './mediaIntelligence/smartUpNextService';
export type { SmartUpNextPlan, SmartUpNextSection, SmartUpNextEntry } from './mediaIntelligence/types';
