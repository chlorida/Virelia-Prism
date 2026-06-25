import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import {
  buildAudioAlbumIdentityKey,
  deriveAlbumDisplayTitle,
  isAudioOnlyItems,
  parseAudioTrackName,
} from './audioAlbumService';

function audioItem(fileName: string, folder: string): MediaItem {
  return {
    id: fileName,
    title: fileName,
    fileName,
    filePath: `${folder}/${fileName}`,
    folder,
    kind: 'audio',
    tags: [],
    addedAt: '0',
    favorite: false,
    mtimeMs: 0,
  };
}

describe('audioAlbumService', () => {
  it('groups audio by folder identity key', () => {
    const item = audioItem('05 - DYING LIGHT THE BEAST - MOOD.mp3', 'D:/Music/Dying Light');
    expect(buildAudioAlbumIdentityKey(item)).toBe('album:d:/music/dying light');
    expect(isAudioOnlyItems([item])).toBe(true);
  });

  it('parses numbered soundtrack filenames', () => {
    expect(parseAudioTrackName('05 - DYING LIGHT THE BEAST - MOOD.mp3')).toEqual({
      trackNumber: 5,
      albumHint: 'DYING LIGHT THE BEAST',
      trackTitle: 'MOOD',
    });
  });

  it('derives a shared album title from soundtrack tracks', () => {
    const folder = 'D:/Music/Dying Light';
    const items = [
      audioItem('05 - DYING LIGHT THE BEAST - MOOD.mp3', folder),
      audioItem('06 - DYING LIGHT THE BEAST - CHASE.mp3', folder),
    ];
    expect(deriveAlbumDisplayTitle(items)).toBe('Dying Light the Beast');
  });
});
