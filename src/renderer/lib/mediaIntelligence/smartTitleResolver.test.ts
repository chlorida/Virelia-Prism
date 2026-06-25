import { describe, expect, it } from 'vitest';
import { parseMediaIdentity } from './episodeParser';
import { preprocessFilename, resolveSmartTitle } from './smartTitleResolver';

describe('SmartTitleResolver', () => {
  it('separates Sonic movie upscaled tags from display title', () => {
    const fileName = '1996 Sonic the Hedgehog the Movie [UPSCALED]_new.mp4';
    const parsed = parseMediaIdentity('', fileName);
    const resolution = resolveSmartTitle({ rawFilename: fileName });

    expect(parsed.displayTitle.toLowerCase()).not.toContain('upscaled');
    expect(parsed.displayTitle.toLowerCase()).not.toMatch(/\bnew\b/);
    expect(parsed.year).toBe(1996);
    expect(parsed.versionTags).toContain('upscaled');
    expect(parsed.cleanSearchQuery?.toLowerCase()).toContain('sonic the hedgehog');
    expect(parsed.cleanSearchQuery).toContain('1996');
    expect(parsed.displayTitle).toMatch(/Sonic the Hedgehog/i);
    expect(resolution.versionTags).toContain('upscaled');
  });

  it('parses Higurashi Sotsu episode with technical bracket tags', () => {
    const fileName = 'Higurashi no Naku Koro ni Sotsu - 01 [1080p][x264][AAC].mkv';
    const parsed = parseMediaIdentity('', fileName);

    expect(parsed.episodeNumber).toBe(1);
    expect(parsed.probableSeriesTitle?.toLowerCase()).toContain('sotsu');
    expect(parsed.displayTitle.toLowerCase()).not.toContain('1080p');
    expect(parsed.displayTitle.toLowerCase()).not.toContain('x264');
    expect(parsed.resolution).toMatch(/1080p/i);
    expect(parsed.videoCodec).toBe('x264');
    expect(parsed.audioCodec).toBe('AAC');
  });

  it('parses Higurashi Gou episode with resolution brackets', () => {
    const fileName = 'Higurashi When They Cry - Gou - Episode 03 [1280x720][x264][AAC].mp4';
    const parsed = parseMediaIdentity('', fileName);

    expect(parsed.episodeNumber).toBe(3);
    expect(parsed.probableSeriesTitle?.toLowerCase()).toContain('gou');
    expect(parsed.displayTitle.toLowerCase()).not.toContain('x264');
    expect(parsed.technicalTags.join(' ').toLowerCase()).toMatch(/1280x720|x264|aac/);
  });

  it('parses movie with parenthetical BluRay tech tags', () => {
    const fileName = 'Some Movie (2020) [BluRay 1080p x265].mkv';
    const parsed = parseMediaIdentity('', fileName);

    expect(parsed.displayTitle).toBe('Some Movie');
    expect(parsed.year).toBe(2020);
    expect(parsed.technicalTags.join(' ').toLowerCase()).toMatch(/bluray|1080p|x265/);
    expect(parsed.displayTitle.toLowerCase()).not.toContain('bluray');
  });

  it('parses dot-separated release filename', () => {
    const fileName = 'Movie.Name.2019.1080p.WEB-DL.x264-GROUP.mkv';
    const pre = preprocessFilename('Movie.Name.2019.1080p.WEB-DL.x264-GROUP');
    const parsed = parseMediaIdentity('', fileName);

    expect(parsed.probableSeriesTitle ?? parsed.cleanTitle).toMatch(/Movie Name/i);
    expect(parsed.year).toBe(2019);
    expect(pre.technicalTags.join(' ').toLowerCase()).toMatch(/1080p|web-dl|x264/);
    expect(parsed.resolution ?? parsed.technicalTags.join(' ')).toMatch(/1080p/i);
    expect(parsed.videoCodec ?? parsed.technicalTags.join(' ')).toMatch(/x264/i);
    expect(parsed.releaseGroupTags ?? pre.releaseGroupTags).toContain('GROUP');
    expect(parsed.releaseGroup ?? pre.releaseGroup).toBe('GROUP');
  });
});
