import { describe, expect, it } from 'vitest';
import { buildSmartUpNextPlan } from './smartUpNextService';
import type { MediaItem } from '../../../shared/types';

function video(id: string, folder: string, fileName: string, ep?: number): MediaItem {
  const title = fileName.replace(/\.[^.]+$/, '');
  return {
    id,
    kind: 'video',
    title,
    fileName,
    folder,
    folderLabel: folder,
    filePath: `C:/${folder}/${fileName}`,
    durationSeconds: 1400,
    favorite: false,
    tags: [],
    addedAt: '2024-01-01T00:00:00.000Z',
    ...(ep != null ? {} : {}),
  };
}

describe('buildSmartUpNextPlan', () => {
  it('puts next episode before audio in same folder', () => {
    const folder = 'Higurashi/Sotsu';
    const current = video('e1', folder, '[Group] Higurashi Sotsu [01][1080p][x265].mkv');
    const e2 = video('e2', folder, '[Group] Higurashi Sotsu [02][1080p][x265].mkv');
    const e3 = video('e3', folder, '[Group] Higurashi Sotsu [03][1080p][x265].mkv');
    const audio: MediaItem = {
      ...video('a1', folder, 'OP.flac'),
      kind: 'audio',
      fileName: 'OP.flac',
      title: 'OP',
    };

    const plan = buildSmartUpNextPlan(current, [current, e2, e3, audio], []);
    expect(plan.hero?.item.id).toBe('e2');
    const firstSection = plan.sections[0];
    expect(firstSection?.entries.every((e) => e.item.kind === 'video') ?? true).toBe(true);
    const audioSection = plan.sections.find((s) => s.id === 'audioFallback');
    const videoSections = plan.sections.filter((s) => s.id !== 'audioFallback');
    expect(videoSections.length).toBeGreaterThan(0);
    if (audioSection) {
      const videoBefore = videoSections.some((s) => s.entries.length > 0);
      expect(videoBefore).toBe(true);
    }
  });

  it('includes next episode in This Season (no skip after hero)', () => {
    const folder = 'Higurashi/Sotsu';
    const e1 = video('e1', folder, '[Group] Higurashi Sotsu [01][1080p].mkv');
    const e2 = video('e2', folder, '[Group] Higurashi Sotsu [02][1080p].mkv');
    const e3 = video('e3', folder, '[Group] Higurashi Sotsu [03][1080p].mkv');
    const e4 = video('e4', folder, '[Group] Higurashi Sotsu [04][1080p].mkv');

    const plan = buildSmartUpNextPlan(e1, [e1, e2, e3, e4], []);
    expect(plan.hero?.item.id).toBe('e2');

    const season = plan.sections.find((s) => s.id === 'thisSeason');
    const seasonIds = season?.entries.map((e) => e.item.id) ?? [];
    expect(seasonIds[0]).toBe('e3');
    expect(seasonIds).toContain('e3');
    expect(seasonIds).not.toContain('e1');
  });

  it('episode 02 hero is episode 03 not episode 15 when episode 03 exists', () => {
    const folder = 'Higurashi/Sotsu';
    const episodes = Array.from({ length: 15 }, (_, i) =>
      video(`e${i + 1}`, folder, `[Group] Higurashi Sotsu [${String(i + 1).padStart(2, '0')}][1080p].mkv`)
    );
    const current = episodes[1]!;
    const plan = buildSmartUpNextPlan(current, episodes, []);
    expect(plan.hero?.item.id).toBe('e3');
  });

  it('EP05 next hero is EP06 with correct season list', () => {
    const folder = 'Higurashi/Sotsu';
    const episodes = Array.from({ length: 8 }, (_, i) =>
      video(`e${i + 1}`, folder, `[Group] Higurashi Sotsu [${String(i + 1).padStart(2, '0')}][1080p].mkv`)
    );
    const current = episodes[4]!;
    const plan = buildSmartUpNextPlan(current, episodes, []);
    expect(plan.hero?.item.id).toBe('e6');
    const seasonIds = plan.sections.find((s) => s.id === 'thisSeason')?.entries.map((e) => e.item.id) ?? [];
    expect(seasonIds[0]).toBe('e7');
    expect(seasonIds).toContain('e7');
    expect(seasonIds).not.toContain('e5');
  });
});
