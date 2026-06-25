import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../../shared/types';
import {
  isConcreteSeriesVideo,
  isLibraryTitleSourceItem,
  isPlayableLocalMediaItem,
  isRecommendableLocalItem,
} from './playableMediaFilter';
import { markMediaPlaybackFailed } from './mediaPlaybackHealth';

function video(id: string, folder: string, fileName: string): MediaItem {
  return {
    id,
    kind: 'video',
    title: fileName,
    fileName,
    folder,
    folderLabel: folder,
    filePath: `${folder}/${fileName}`,
    durationSeconds: 100,
    favorite: false,
    tags: [],
    addedAt: '',
  };
}

describe('playableMediaFilter', () => {
  it('rejects .d.ts type definition files misclassified as video', () => {
    const item = video('dts', 'C:/app/types', 'AcceleratedRendererSettings.d.ts');
    expect(isPlayableLocalMediaItem(item)).toBe(false);
    expect(isRecommendableLocalItem(item)).toBe(false);
  });

  it('rejects locale resource paths', () => {
    const item = video('loc', 'C:/app/locales', 'en.json');
    expect(isPlayableLocalMediaItem(item)).toBe(false);
  });

  it('rejects subtitle files', () => {
    const item = video('sub', 'D:/Anime', 'ep01.srt');
    expect(isPlayableLocalMediaItem(item)).toBe(false);
  });

  it('rejects screen recording timestamp filenames', () => {
    const item = video('rec', 'D:/Videos', '2026-05-31 02-26.mp4');
    expect(isPlayableLocalMediaItem(item)).toBe(false);
    expect(isLibraryTitleSourceItem(item)).toBe(false);
  });

  it('rejects dated screen recording titles', () => {
    const item = video('rec2', 'D:/Videos', 'Моя Бумажная Принцесса 🤍 2025-03-24.mp4');
    expect(isLibraryTitleSourceItem(item)).toBe(false);
    expect(isRecommendableLocalItem(item)).toBe(false);
  });

  it('rejects generic numbered files from recommendations', () => {
    const item = video('gen', 'D:/Misc', '0802(2).mp4');
    expect(isRecommendableLocalItem(item)).toBe(false);
  });

  it('rejects audio from video recommendations', () => {
    const item: MediaItem = {
      ...video('mp3', 'D:/Misc', 'track.mp3'),
      kind: 'audio',
      fileName: 'track.mp3',
    };
    expect(isRecommendableLocalItem(item)).toBe(false);
  });

  it('rejects YouTube-style counter filenames', () => {
    const item = video('yt', 'D:/Downloads', '(5) Some Random Video.mp4');
    expect(isLibraryTitleSourceItem(item)).toBe(false);
  });

  it('rejects generic franchise video without episode', () => {
    const item = video('gen', 'D:/Anime', 'Higurashi no Naku Koro ni.mkv');
    expect(isConcreteSeriesVideo(item)).toBe(false);
    expect(isRecommendableLocalItem(item)).toBe(false);
  });

  it('accepts Gou episode file', () => {
    const item = video('g1', 'D:/Anime/Gou', 'Higurashi Gou - 01 (BD 720p).mkv');
    expect(isRecommendableLocalItem(item)).toBe(true);
  });

  it('excludes playback-blocked items', () => {
    const item = video('bad', 'D:/Anime', 'broken.mkv');
    markMediaPlaybackFailed(item.id, 'corrupt', 'corrupt file');
    expect(isRecommendableLocalItem(item)).toBe(false);
  });
});
