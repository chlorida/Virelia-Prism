import type { MediaItem } from '../../../shared/types';
import { getCachedParsedIdentity } from './mediaIdentityCache';

export type MediaIntent =
  | 'audio'
  | 'music-video'
  | 'series-episode'
  | 'anime-episode'
  | 'special'
  | 'movie'
  | 'short-video'
  | 'unknown-video';

export interface MediaIntentResult {
  mediaIntent: MediaIntent;
  confidence: number;
  reasons: string[];
}

const MUSIC_VIDEO_RE = /\b(mv|music\s*video|lyric|lyrics|visualizer|concert|live|performance|ost|soundtrack|opening|ending|\bop\b|\bed\b|amv|pv)\b/i;
const MUSIC_FOLDER_RE = /\b(music\s*videos?|clips?|concerts?|ost|soundtracks?|performances?)\b/i;

function haystack(item: MediaItem): string {
  return `${item.title} ${item.fileName} ${item.folder} ${item.artist ?? ''} ${item.album ?? ''}`.toLowerCase();
}

export function detectMediaIntent(item: MediaItem): MediaIntentResult {
  if (item.kind === 'audio') {
    return { mediaIntent: 'audio', confidence: 1, reasons: ['kind-audio'] };
  }

  const text = haystack(item);
  const parsed = getCachedParsedIdentity(item);
  const reasons: string[] = [];

  if (parsed.isSpecial || parsed.specialType) {
    return {
      mediaIntent: 'special',
      confidence: 0.92,
      reasons: ['special-ova', parsed.specialType ?? 'special'].filter(Boolean) as string[],
    };
  }

  let musicScore = 0;

  if (MUSIC_VIDEO_RE.test(text)) {
    musicScore += 3;
    reasons.push('title-keyword');
  }
  if (MUSIC_FOLDER_RE.test(text)) {
    musicScore += 2;
    reasons.push('folder-keyword');
  }
  if (item.artist || item.album) {
    musicScore += 1;
    reasons.push('audio-metadata');
  }
  const duration = item.durationSeconds ?? 0;
  if (duration >= 60 && duration <= 480) {
    musicScore += 1;
    reasons.push('short-duration');
  }

  if (parsed.episodeNumber != null) {
    const isAnime = /\b(anime|subsplease|erai|horriblesubs)\b/i.test(text)
      || parsed.releaseGroup?.match(/subsplease|erai/i);
    return {
      mediaIntent: isAnime ? 'anime-episode' : 'series-episode',
      confidence: 0.9,
      reasons: ['episode-number', ...(isAnime ? ['anime-release'] : ['tv-pattern'])],
    };
  }

  if (parsed.seasonNumber != null || /\bS\d{1,2}E\d{1,2}\b/i.test(item.fileName)) {
    return { mediaIntent: 'series-episode', confidence: 0.85, reasons: ['season-episode-pattern'] };
  }

  if (parsed.year != null && duration > 1200) {
    return { mediaIntent: 'movie', confidence: 0.75, reasons: ['year-long-form'] };
  }

  if (musicScore >= 4) {
    return { mediaIntent: 'music-video', confidence: Math.min(0.95, 0.5 + musicScore * 0.1), reasons };
  }

  if (duration > 0 && duration < 90) {
    return { mediaIntent: 'short-video', confidence: 0.6, reasons: ['very-short'] };
  }

  return { mediaIntent: 'unknown-video', confidence: 0.4, reasons: reasons.length ? reasons : ['default-video'] };
}
