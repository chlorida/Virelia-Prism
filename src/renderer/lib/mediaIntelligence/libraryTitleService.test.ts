import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import { buildLibraryTitles } from './libraryTitleService';
import { buildSmartUpNextPlan } from './smartUpNextService';
import { buildSeriesGroup, findNextEpisodeInSeries } from './seriesGrouping';
import { resolveTitlePlayTarget } from './titlePlaybackService';

function item(id: string, folder: string, fileName: string, extras?: Partial<MediaItem>): MediaItem {
  return {
    id,
    kind: 'video',
    fileName,
    title: fileName,
    folder,
    filePath: `${folder}/${fileName}`,
    tags: [],
    addedAt: '',
    favorite: false,
    durationSeconds: 1421,
    ...extras,
  };
}

function sotsuEp(num: number, folder: string, idSuffix = ''): MediaItem {
  const padded = String(num).padStart(2, '0');
  const fileName = `[VCB-Studio] Higurashi no Naku Koro ni Sotsu [${padded}][Ma10p_1080p][x265_flac].mkv`;
  return item(`${folder}-e${padded}${idSuffix}`, folder, fileName);
}

describe('buildLibraryTitles episode/version grouping', () => {
  it('merges duplicate Sotsu copies from different folders into one title', () => {
    const titles = buildLibraryTitles([
      item('a1', 'D:/Anime/Sotsu', '[Group] Higurashi Sotsu [01].mkv'),
      item('a2', 'D:/Copy/Sotsu', '[Group] Higurashi Sotsu [01].mkv'),
      item('b1', 'D:/Anime/Sotsu', '[Group] Higurashi Sotsu [02].mkv'),
    ]);
    const sotsuTitles = titles.filter((title) => title.displayTitle.toLowerCase().includes('sotsu'));
    expect(sotsuTitles.length).toBe(1);
    expect(sotsuTitles[0]?.totalFileCount).toBe(3);
    expect(sotsuTitles[0]?.uniqueEpisodeCount).toBe(2);
    expect(sotsuTitles[0]?.duplicateVersionCount).toBe(1);
    expect(sotsuTitles[0]?.episodes?.length).toBe(2);
    expect(sotsuTitles[0]?.episodes?.[0]?.versions.length).toBe(2);
  });

  it('groups 15 Sotsu episodes × 2 duplicate folders correctly', () => {
    const original = Array.from({ length: 15 }, (_, i) => sotsuEp(i + 1, 'D:/Anime/Sotsu'));
    const duplicate = Array.from({ length: 15 }, (_, i) => sotsuEp(i + 1, 'D:/Copy/Sotsu', '-copy'));
    const titles = buildLibraryTitles([...original, ...duplicate]);
    const sotsu = titles.find((t) => t.displayTitle.toLowerCase().includes('sotsu'));
    expect(sotsu).toBeDefined();
    expect(sotsu!.uniqueEpisodeCount).toBe(15);
    expect(sotsu!.totalFileCount).toBe(30);
    expect(sotsu!.duplicateVersionCount).toBe(15);
    expect(sotsu!.episodes?.length).toBe(15);
    expect(sotsu!.episodes?.every((ep) => ep.versions.length === 2)).toBe(true);
  });

  it('keeps Gou, Sotsu, and Kaku as separate titles', () => {
    const titles = buildLibraryTitles([
      item('g1', 'D:/Anime', '[Group] Higurashi Gou [01].mkv'),
      item('g2', 'D:/Anime', '[Group] Higurashi Gou [02].mkv'),
      item('s1', 'D:/Anime', '[Group] Higurashi Sotsu [01].mkv'),
      item('s2', 'D:/Anime', '[Group] Higurashi Sotsu [02].mkv'),
      item('k1', 'D:/Anime', '[Group] Higurashi Kaku [OVA].mkv'),
    ]);
    const gou = titles.filter((t) => t.displayTitle.toLowerCase().includes('gou'));
    const sotsu = titles.filter((t) => t.displayTitle.toLowerCase().includes('sotsu'));
    const kaku = titles.filter((t) => t.displayTitle.toLowerCase().includes('kaku'));
    expect(gou.length).toBe(1);
    expect(sotsu.length).toBe(1);
    expect(kaku.length).toBe(1);
    expect(gou[0]?.uniqueEpisodeCount).toBe(2);
    expect(sotsu[0]?.uniqueEpisodeCount).toBe(2);
  });
});

describe('duplicate episode Up Next / playback', () => {
  it('Up Next from Sotsu episode 02 returns episode 03 preferred version', () => {
    const folder = 'D:/Anime/Sotsu';
    const episodes = Array.from({ length: 15 }, (_, i) => sotsuEp(i + 1, folder));
    const dupes = Array.from({ length: 15 }, (_, i) => sotsuEp(i + 1, 'D:/Copy/Sotsu', '-copy'));
    const all = [...episodes, ...dupes];
    const current = episodes[1]!;
    const plan = buildSmartUpNextPlan(current, all, []);
    expect(plan.hero?.item.id).toBe('D:/Anime/Sotsu-e03');
    const seasonIds = plan.sections.find((s) => s.id === 'thisSeason')?.entries.map((e) => e.item.id) ?? [];
    const uniqueEpNums = new Set(
      seasonIds.map((id) => all.find((i) => i.id === id)?.fileName.match(/\[(\d{2})\]/)?.[1])
    );
    expect(uniqueEpNums.size).toBe(seasonIds.length);
  });

  it('play target uses preferred version for duplicated episode', () => {
    const ep1a = item('a', 'D:/Anime', '[Group] Higurashi Sotsu [01][720p].mkv');
    const ep1b = item('b', 'D:/Copy', '[Group] Higurashi Sotsu [01][1080p].mkv');
    const ep2 = item('c', 'D:/Anime', '[Group] Higurashi Sotsu [02][1080p].mkv');
    const titles = buildLibraryTitles([ep1a, ep1b, ep2]);
    const sotsu = titles.find((t) => t.displayTitle.toLowerCase().includes('sotsu'))!;
    const target = resolveTitlePlayTarget(sotsu);
    expect(target?.item.id).toBe('b');
  });

  it('findNextEpisodeInSeries dedupes duplicate episode files', () => {
    const items = [
      sotsuEp(1, 'D:/Anime/Sotsu'),
      sotsuEp(2, 'D:/Anime/Sotsu'),
      sotsuEp(2, 'D:/Copy/Sotsu', '-dup'),
      sotsuEp(3, 'D:/Anime/Sotsu'),
    ];
    const group = buildSeriesGroup('sotsu', items[0]!.folder, items);
    expect(group.episodes.length).toBe(3);
    expect(findNextEpisodeInSeries(items[1]!, group)?.id).toBe('D:/Anime/Sotsu-e03');
  });
});
