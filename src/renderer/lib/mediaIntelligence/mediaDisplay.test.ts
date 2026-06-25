import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import { resolveMediaDisplay } from './mediaDisplay';
import { buildMediaDisplayIdentity } from './mediaIdentityService';

const sotsuFile = '[VCB-Studio] Higurashi no Naku Koro ni Sotsu [05][1080p].mkv';

function item(fileName: string, id = 'x'): MediaItem {
  return {
    id,
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

describe('resolveMediaDisplay', () => {
  it('uses same title for library and watch surfaces', () => {
    const media = item(sotsuFile);
    const library = resolveMediaDisplay(media, { language: 'en' });
    const watch = resolveMediaDisplay(media, { language: 'en' });
    expect(library.title).toBe(watch.title);
    expect(library.title).not.toMatch(/Когда|цикады/);
    expect(library.title).toMatch(/Higurashi|When They Cry|Sotsu|Episode|05/i);
  });

  it('English UI does not surface Russian alias', () => {
    const display = resolveMediaDisplay(item(sotsuFile), { language: 'en' });
    expect(display.title).not.toMatch(/[\u0400-\u04FF]/);
  });

  it('Russian UI can show Russian alias', () => {
    const display = resolveMediaDisplay(item(sotsuFile), { language: 'ru' });
    expect(display.title).toMatch(/цикады|Сота|серия/i);
  });

  it('matches buildMediaDisplayIdentity title', () => {
    const media = item(sotsuFile);
    const display = resolveMediaDisplay(media, { language: 'en' });
    const identity = buildMediaDisplayIdentity(media, 'en');
    expect(display.title).toBe(identity.title);
  });
});
