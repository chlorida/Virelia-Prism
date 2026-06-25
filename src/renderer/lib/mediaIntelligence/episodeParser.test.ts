import { describe, expect, it } from 'vitest';
import { parseMediaIdentity } from './episodeParser';
import { buildMediaDisplayIdentity } from './mediaIdentityService';
import type { MediaItem } from '../../../shared/types';

function fakeItem(fileName: string): MediaItem {
  return {
    id: 'test',
    filePath: `C:/Anime/${fileName}`,
    fileName,
    folder: 'Anime',
    title: fileName,
    tags: [],
    kind: 'video',
    addedAt: '',
    favorite: false,
  };
}

describe('parseMediaIdentity', () => {
  it('parses anime release filename (Sotsu)', () => {
    const id = parseMediaIdentity(
      '',
      '[VCB-Studio] Higurashi no Naku Koro ni Sotsu [01][Ma10p_1080p][x265_flac].mkv'
    );
    expect(id.releaseGroup).toBe('VCB-Studio');
    expect(id.probableSeriesTitle).toContain('Sotsu');
    expect(id.episodeNumber).toBe(1);
    expect(id.resolution).toMatch(/1080p/i);
    expect(id.displayTitle).toContain('01');
  });

  it('parses Gou dash episode with parenthetical tech', () => {
    const id = parseMediaIdentity(
      '',
      'Higurashi No Naku Koro Ni Gou - 01 (BD 1280x720 x264 AAC).mkv'
    );
    expect(id.episodeNumber).toBe(1);
    expect(id.probableSeriesTitle?.toLowerCase()).toContain('gou');
    expect(id.displayTitle.toLowerCase()).not.toContain('x264');
    expect(id.videoCodec).toBe('x264');
    expect(id.rawFilename).toContain('Gou');
  });

  it('parses S02E05 pattern', () => {
    const id = parseMediaIdentity('', 'Show.Name.S02E05.1080p.WEB-DL.x265.mkv');
    expect(id.seasonNumber).toBe(2);
    expect(id.episodeNumber).toBe(5);
    expect(id.probableSeriesTitle).toContain('Show Name');
  });

  it('removes site junk from titles', () => {
    const id = parseMediaIdentity('', 'Cool Song TubeRipper click uploaded.mp3');
    expect(id.cleanTitle.toLowerCase()).not.toContain('tuberipper');
    expect(id.junkTags.length).toBeGreaterThan(0);
  });
});

describe('localized display', () => {
  it('uses Russian alias for Gou', () => {
    const display = buildMediaDisplayIdentity(
      fakeItem('Higurashi No Naku Koro Ni Gou - 01 (BD 1280x720 x264).mkv'),
      'ru'
    );
    expect(display.title).toContain('цикады');
    expect(display.title).not.toMatch(/1280x720/i);
  });

  it('uses English alias for Gou', () => {
    const display = buildMediaDisplayIdentity(
      fakeItem('Higurashi No Naku Koro Ni Gou - 02 (BD 720p).mkv'),
      'en'
    );
    expect(display.title).toMatch(/Higurashi|When They Cry/i);
    expect(display.title).toContain('02');
  });
});
