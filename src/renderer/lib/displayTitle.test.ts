import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../shared/types';
import { parseDisplayTitle, resolveMediaDisplayTitle } from './displayTitle';

describe('parseDisplayTitle', () => {
  it('strips technical brackets and formats episode', () => {
    const r = parseDisplayTitle(
      '',
      '[VCB Studio] Higurashi no Naku Koro ni Sotsu [01][Ma10p 1080p][x265 FLAC].mkv',
      'en'
    );
    expect(r.title).toContain('Higurashi');
    expect(r.title).toMatch(/01/);
    expect(r.chips.some((c) => /1080p/i.test(c))).toBe(true);
  });

  it('removes extension from filename fallback', () => {
    const r = parseDisplayTitle('', 'My_Show_02.mp4');
    expect(r.title).toContain('My Show');
  });
});

describe('resolveMediaDisplayTitle', () => {
  const sotsu: MediaItem = {
    id: 's1',
    filePath: 'D:/Anime/sotsu.mkv',
    fileName: '[VCB-Studio] Higurashi no Naku Koro ni Sotsu [05][1080p].mkv',
    folder: 'D:/Anime/Sotsu',
    title: '[VCB-Studio] Higurashi no Naku Koro ni Sotsu [05][1080p].mkv',
    tags: [],
    kind: 'video',
    addedAt: '',
    favorite: false,
  };

  it('English UI uses English franchise title, not Russian', () => {
    const title = resolveMediaDisplayTitle(sotsu, { language: 'en' });
    expect(title).not.toMatch(/Когда|цикады/);
    expect(title).toMatch(/Higurashi|When They Cry|Sotsu|Episode|05/i);
  });
});
