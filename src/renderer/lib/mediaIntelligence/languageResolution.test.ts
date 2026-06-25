import { describe, expect, it } from 'vitest';
import { resolveEffectiveMediaLanguage } from './languageResolution';
import { buildMediaDisplayIdentity } from './mediaIdentityService';
import type { MediaItem } from '../../../shared/types';

const sotsuFile = '[VCB-Studio] Higurashi no Naku Koro ni Sotsu [01][1080p][x265].mkv';

function item(fileName: string): MediaItem {
  return {
    id: 'x',
    filePath: `D:/Anime/${fileName}`,
    fileName,
    folder: 'D:/Anime/Sotsu',
    title: fileName,
    tags: [],
    kind: 'video',
    addedAt: '',
    favorite: false,
  };
}

describe('resolveEffectiveMediaLanguage', () => {
  it('uses UI English when metadata is auto', () => {
    expect(resolveEffectiveMediaLanguage({
      uiLanguage: 'en',
      metadataLanguage: 'auto',
      uiLocale: 'ru',
    })).toBe('en');
  });

  it('uses UI Russian when both explicit', () => {
    expect(resolveEffectiveMediaLanguage({
      uiLanguage: 'ru',
      metadataLanguage: 'auto',
      uiLocale: 'en',
    })).toBe('ru');
  });
});

describe('display title language', () => {
  it('English UI never shows Russian alias in title', () => {
    const display = buildMediaDisplayIdentity(item(sotsuFile), 'en');
    expect(display.title).not.toMatch(/Когда|цикады|серия/);
    expect(display.title).toMatch(/Higurashi|When They Cry|Sotsu|Episode|01/i);
  });

  it('Russian UI shows Russian alias when available', () => {
    const display = buildMediaDisplayIdentity(item(sotsuFile), 'ru');
    expect(display.title).toMatch(/цикады|Сота|серия/i);
  });
});
