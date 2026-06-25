import type { MediaItem } from '../../../shared/types';
import { getExtensionInfo, shouldIncludeInLibrary, isLikelyPersonalOrJunkMedia } from '../../../shared/mediaFileFilter';
import { findSeriesAlias, normalizeAliasKey } from './aliasCache';
import { parseMediaIdentity, normalizeSeriesKey, hasExplicitEpisodeMarker } from './episodeParser';
import {
  looksLikeGenericFileStem,
  looksLikeRecordingOrAssetTitle,
} from './libraryTitleFilters';
import { isMediaPlaybackBlocked } from './mediaPlaybackHealth';

const SUBTITLE_EXT = /\.(srt|ass|ssa|vtt|sub)$/i;
const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.webm', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.m2ts', '.mpg', '.mpeg', '.ts']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.opus', '.m4a', '.aac', '.wma']);

const BLOCKED_PATH_RE = /[/\\](locales?|assets?|resources?|thumbnails?|node_modules|dist|renderer|\.git)[/\\]/i;
const BLOCKED_FOLDER_RE = /[/\\](locales?|assets?|resources?|thumbnails?|subs?|subtitles?)$/i;

export function isIndexedMediaPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (!normalized || normalized.length < 3) return false;
  if (BLOCKED_PATH_RE.test(normalized)) return false;
  if (normalized.includes('/user data/thumbnails')) return false;
  return true;
}

function fileNameHasMediaExtension(fileName: string, allowed: Set<string>): boolean {
  const ext = getExtensionInfo(fileName).compoundExtension;
  return allowed.has(ext);
}

export function isPlayableLocalMediaItem(item: MediaItem): boolean {
  if (!item.id?.trim()) return false;
  if (!item.filePath?.trim()) return false;
  if (item.kind !== 'video' && item.kind !== 'audio') return false;
  if (!shouldIncludeInLibrary(item.filePath, item.fileName)) return false;
  if (SUBTITLE_EXT.test(item.fileName)) return false;
  if (!isIndexedMediaPath(item.filePath)) return false;
  if (BLOCKED_FOLDER_RE.test(item.folder.replace(/\\/g, '/'))) return false;

  if (item.kind === 'video' && !fileNameHasMediaExtension(item.fileName, VIDEO_EXTENSIONS)) return false;
  if (item.kind === 'audio' && !fileNameHasMediaExtension(item.fileName, AUDIO_EXTENSIONS)) return false;

  if (isMediaPlaybackBlocked(item.id)) return false;
  return true;
}

/** Items that should appear in the local titles shelf (stricter than raw scan). */
export function isLibraryTitleSourceItem(item: MediaItem): boolean {
  if (!isPlayableLocalMediaItem(item)) return false;
  if (isLikelyPersonalOrJunkMedia(item.filePath, item.fileName)) return false;
  return true;
}

/** Exclude generic franchise alias matches without episode (metadata-only style entries). */
export function isConcreteSeriesVideo(item: MediaItem): boolean {
  if (item.kind !== 'video') return true;

  const identity = parseMediaIdentity(item.title, item.fileName);
  if (looksLikeGenericFileStem(item.fileName) || looksLikeRecordingOrAssetTitle(item.fileName)) {
    return false;
  }
  if (looksLikeRecordingOrAssetTitle(identity.displayTitle) || looksLikeRecordingOrAssetTitle(identity.cleanTitle)) {
    return false;
  }

  const key = normalizeSeriesKey(identity);
  if (hasExplicitEpisodeMarker(item.fileName, key)) return true;

  const alias = findSeriesAlias(key);
  if (alias) {
    if (alias.arcTokens && alias.arcTokens.length > 0) {
      return alias.arcTokens.some((token) => key.includes(token));
    }
    return false;
  }

  return identity.mediaTypeHint === 'movie'
    || identity.isSpecial
    || Boolean(identity.franchiseId);
}

export function isRecommendableLocalItem(item: MediaItem, currentId?: string): boolean {
  if (currentId && item.id === currentId) return false;
  if (!isPlayableLocalMediaItem(item)) return false;
  if (isLikelyPersonalOrJunkMedia(item.filePath, item.fileName)) return false;
  if (item.kind === 'audio') return false;
  if (item.kind === 'video' && !isConcreteSeriesVideo(item)) return false;
  return true;
}

export function filterPlayableLocalRecommendations(
  items: MediaItem[],
  currentId?: string
): MediaItem[] {
  return items.filter((item) => isRecommendableLocalItem(item, currentId));
}
