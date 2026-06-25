import { describe, expect, it } from 'vitest';
import { parseMediaIdentity } from '../episodeParser';
import { buildLibraryTitles } from '../libraryTitleService';
import { buildTitleMatchInput, pickBestMetadataMatch } from './metadataMatcher';
import { anilistProvider } from './providers/anilistProvider';
import { fetchJikanMediaSupplement } from './jikanMediaSupplement';
import { fetchAnilistEpisodeScreenshots } from './anilistEpisodeScreenshots';

import type { MediaItem } from '../../../../shared/types';

describe('live metadata integration', () => {
  it('parses sonic file and matches anilist', async () => {
    const file = '1996 Sonic the Hedgehog the Movie [UPSCALED]_new.mp4';
    const items: MediaItem[] = [{
      id: '1',
      title: file,
      fileName: file,
      filePath: `D:/Downloads/${file}`,
      folder: 'D:/Downloads',
      kind: 'video',
      tags: [],
      addedAt: '0',
      favorite: false,
      mtimeMs: 0,
    }];
    const title = buildLibraryTitles(items)[0]!;
    const input = buildTitleMatchInput(title);
    const results = await anilistProvider.search({
      title: input.title,
      kind: 'movie',
      year: input.year,
    });
    const picked = pickBestMetadataMatch(input, results);
    expect(picked.best).toBeDefined();
    expect(picked.best?.title.toLowerCase()).toContain('sonic');
  }, 30000);

  it('loads jikan promotional art for sotsu mal id', async () => {
    const supplement = await fetchJikanMediaSupplement(48438);
    expect(supplement.promotionalArt.length).toBeGreaterThan(0);
    expect(supplement.promotionalArt.every((asset) => asset.kind === 'poster')).toBe(true);
  }, 30000);

  it('loads anilist episode screenshots for demon slayer mal id', async () => {
    const screenshots = await fetchAnilistEpisodeScreenshots({ malId: 38000 });
    expect(screenshots.length).toBeGreaterThan(0);
    expect(screenshots.every((asset) => asset.kind === 'screenshot')).toBe(true);
    expect(screenshots[0]?.url).toMatch(/^https:\/\//);
  }, 30000);
});
