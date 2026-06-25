import { describe, expect, it } from 'vitest';
import { buildSmartUpNextPlan } from './smartUpNextService';
import type { MediaItem } from '../../../shared/types';

function ep(
  id: string,
  folder: string,
  fileName: string,
  episode: number
): MediaItem {
  const arc = folder.includes('Gou') ? 'Gou' : 'Sotsu';
  return {
    id,
    kind: 'video',
    title: fileName,
    fileName,
    folder,
    folderLabel: folder,
    filePath: `${folder}/${fileName}`,
    durationSeconds: 1400,
    favorite: false,
    tags: [],
    addedAt: '',
  };
}

describe('offline Up Next', () => {
  const sotsuFolder = 'D:/Anime/Sotsu';
  const gouFolder = 'D:/Anime/Gou';

  const sotsu01 = ep('s01', sotsuFolder, 'Higurashi no Naku Koro ni Sotsu - 01.mkv', 1);
  const sotsu02 = ep('s02', sotsuFolder, 'Higurashi no Naku Koro ni Sotsu - 02.mkv', 2);
  const sotsu03 = ep('s03', sotsuFolder, 'Higurashi no Naku Koro ni Sotsu - 03.mkv', 3);
  const gou01 = ep('g01', gouFolder, 'Higurashi No Naku Koro Ni Gou - 01.mkv', 1);
  const gou02 = ep('g02', gouFolder, 'Higurashi No Naku Koro Ni Gou - 02.mkv', 2);
  const gou03 = ep('g03', gouFolder, 'Higurashi No Naku Koro Ni Gou - 03.mkv', 3);
  const generic = {
    ...ep('gen', 'D:/Anime', 'Higurashi no Naku Koro ni.mkv', 0),
    fileName: 'Higurashi no Naku Koro ni.mkv',
  };

  const catalog = [sotsu01, sotsu02, sotsu03, gou01, gou02, gou03, generic];

  it('Sotsu EP01 recommends Sotsu EP02 first', () => {
    const plan = buildSmartUpNextPlan(sotsu01, catalog, [], 'en');
    expect(plan.hero?.item.id).toBe('s02');
  });

  it('Gou EP03 does not recommend Gou EP01 as hero', () => {
    const plan = buildSmartUpNextPlan(gou03, catalog, [], 'en');
    expect(plan.hero?.item.id).not.toBe('g01');
    expect(plan.episodeIndex).toBe(3);
  });

  it('Gou EP05 recommends Gou EP06 when folder has more episodes than library title count', () => {
    const gouEpisodes = Array.from({ length: 6 }, (_, index) => {
      const num = index + 1;
      const padded = String(num).padStart(2, '0');
      return ep(
        `g${padded}`,
        gouFolder,
        `Higurashi No Naku Koro Ni Gou - ${padded}.mkv`,
        num
      );
    });
    const plan = buildSmartUpNextPlan(gouEpisodes[4]!, gouEpisodes, [], 'en');
    expect(plan.hero?.item.id).toBe('g06');
    expect(plan.episodeIndex).toBe(5);
    expect(plan.episodeCount).toBeGreaterThanOrEqual(6);
  });

  it('relatedSeason shows one entry per franchise arc, not every episode', () => {
    const plan = buildSmartUpNextPlan(sotsu01, catalog, [], 'en');
    const related = plan.sections.find((section) => section.id === 'relatedSeason');
    const gouIds = related?.entries.filter((entry) => entry.item.folder === gouFolder) ?? [];
    expect(gouIds.length).toBeLessThanOrEqual(1);
  });

  it('Gou EP01 recommends Gou EP02 before Sotsu', () => {
    const plan = buildSmartUpNextPlan(gou01, catalog, [], 'en');
    expect(plan.hero?.item.id).toBe('g02');
    const videoIds = plan.sections.flatMap((s) => s.entries.map((e) => e.item.id));
    const s02Index = videoIds.indexOf('s02');
    const g03Index = videoIds.indexOf('g02');
    if (s02Index >= 0 && g03Index >= 0) {
      expect(g03Index).toBeLessThan(s02Index);
    }
  });

  it('never recommends generic franchise-only file', () => {
    const plan = buildSmartUpNextPlan(sotsu01, catalog, [], 'en');
    const allIds = [
      ...(plan.hero ? [plan.hero.item.id] : []),
      ...plan.sections.flatMap((s) => s.entries.map((e) => e.item.id)),
    ];
    expect(allIds).not.toContain('gen');
  });

  it('all entries are local-library sourced', () => {
    const plan = buildSmartUpNextPlan(sotsu01, catalog, [], 'en');
    const entries = [
      ...(plan.hero ? [plan.hero] : []),
      ...plan.sections.flatMap((s) => s.entries),
    ];
    for (const entry of entries) {
      expect(entry.source).toBe('local-library');
      expect(entry.item.filePath).toBeTruthy();
    }
  });
});
