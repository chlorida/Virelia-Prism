import type { MediaItem } from '../../../shared/types';

export interface LocalizedTitleMap {
  en?: string;
  ru?: string;
  ja?: string;
  romaji?: string;
  original?: string;
}

export type DisplayTitleSource = 'manual' | 'provider' | 'alias-cache' | 'parser' | 'fallback';

export type MediaTypeHint = 'movie' | 'series' | 'ova' | 'special' | 'episode' | 'unknown';

export interface SmartTitleResolverInput {
  filePath?: string;
  rawFilename: string;
  rawTitle?: string;
  extension?: string;
  folderPath?: string;
  durationSeconds?: number;
  kind?: 'video' | 'audio';
  existingEpisode?: number;
  existingSeason?: number;
}

export interface SmartTitleResolution {
  rawTitle: string;
  displayTitle: string;
  canonicalTitle?: string;
  localizedTitle?: string;
  cleanSearchQuery: string;
  year?: number;
  season?: number;
  episode?: number;
  mediaTypeHint?: MediaTypeHint;
  versionTags: string[];
  technicalTags: string[];
  releaseGroupTags: string[];
  ignoredReleaseTokens: string[];
  confidence: number;
  needsExternalMetadata: boolean;
  warnings?: string[];
}

export interface ParsedMediaIdentity {
  rawFilename: string;
  rawTitle: string;
  cleanBaseName: string;
  cleanTitle: string;
  displayTitle: string;
  probableTitle: string;
  probableSeriesTitle?: string;
  localizedTitle?: string;
  localizedTitles?: LocalizedTitleMap;
  originalTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  year?: number;
  releaseGroup?: string;
  source?: string;
  resolution?: string;
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
  technicalTags: string[];
  versionTags?: string[];
  releaseGroupTags?: string[];
  ignoredReleaseTokens?: string[];
  cleanSearchQuery?: string;
  canonicalTitle?: string;
  mediaTypeHint?: MediaTypeHint;
  needsExternalMetadata?: boolean;
  junkTags: string[];
  confidence: number;
  franchiseId?: string;
  /** OVA / Special / Movie-like local video (not a numbered season episode). */
  isSpecial?: boolean;
  specialTitle?: string;
  specialType?: 'OVA' | 'OAD' | 'Special' | 'Movie' | 'Extra' | 'Bonus' | string;
}

export type LibraryTitleSource = 'local-parser' | 'cache' | 'external-metadata' | 'manual';

export interface EpisodeVersion {
  itemId: string;
  path: string;
  filename: string;
  quality?: string;
  resolution?: string;
  codec?: string;
  audioCodec?: string;
  releaseGroup?: string;
  technicalTags: string[];
  versionTags: string[];
  isPreferred?: boolean;
}

export interface LibraryEpisode {
  id: string;
  titleId: string;
  episodeNumber?: number;
  seasonNumber?: number;
  displayTitle: string;
  versions: EpisodeVersion[];
  preferredItemId?: string;
  durationSeconds?: number;
}

/** @deprecated Use LibraryEpisode */
export type MediaEpisode = LibraryEpisode;

export interface LibraryTitle {
  id: string;
  canonicalTitle: string;
  displayTitle: string;
  localizedTitle?: string;
  year?: number;
  mediaType: 'movie' | 'series' | 'ova' | 'special' | 'album' | 'unknown';
  items: MediaItem[];
  episodes?: LibraryEpisode[];
  uniqueEpisodeCount: number;
  totalFileCount: number;
  duplicateVersionCount: number;
  preferredItemId?: string;
  posterUrl?: string;
  localPosterPath?: string;
  backdropPath?: string;
  summary?: string;
  confidence: number;
  source: LibraryTitleSource;
  versionTags?: string[];
  technicalTags?: string[];
  franchiseId?: string;
  folderPath?: string;
}

export interface MediaDisplayIdentity {
  title: string;
  subtitle?: string;
  originalTitle?: string;
  localizedTitles?: LocalizedTitleMap;
  seasonLabel?: string;
  episodeLabel?: string;
  technicalChips: string[];
  confidence: number;
  source: DisplayTitleSource;
  parsed: ParsedMediaIdentity;
}

export interface EpisodeItem {
  mediaItemId: string;
  seasonNumber?: number;
  episodeNumber?: number;
  title: string;
  displayTitle: string;
  fileName: string;
  durationSeconds?: number;
  resumePositionSeconds?: number;
  thumbnailPath?: string;
}

export interface SeriesGroup {
  id: string;
  title: string;
  localizedTitle?: string;
  franchiseId?: string;
  folderPath?: string;
  items: MediaItem[];
  episodes: EpisodeItem[];
  confidence: number;
}

export type UpNextSectionId =
  | 'nextEpisode'
  | 'thisSeason'
  | 'sameSeries'
  | 'sameFolder'
  | 'relatedSeason'
  | 'continueWatching'
  | 'similar'
  | 'alsoFromLibrary'
  | 'audioFallback';

export interface SmartUpNextEntry {
  item: MediaItem;
  score: number;
  reasons: string[];
  section: UpNextSectionId;
  identity: ParsedMediaIdentity;
  franchiseLabel?: string;
  source: 'local-library';
}

export interface SmartUpNextSection {
  id: UpNextSectionId;
  labelKey: string;
  entries: SmartUpNextEntry[];
}

export interface SmartUpNextPlan {
  currentIdentity: ParsedMediaIdentity | null;
  displayIdentity: MediaDisplayIdentity | null;
  series: SeriesGroup | null;
  hero: SmartUpNextEntry | null;
  sections: SmartUpNextSection[];
  episodeIndex?: number;
  episodeCount?: number;
}

export interface MediaManualOverride {
  titles?: LocalizedTitleMap;
  seriesTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}
