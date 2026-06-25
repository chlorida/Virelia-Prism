/** Persistent title metadata cache — shared between main and renderer. */

export const TITLE_METADATA_CACHE_VERSION = 5;

export type TitleMetadataState =
  | 'localOnly'
  | 'metadataLoading'
  | 'metadataReady'
  | 'metadataFailed'
  | 'metadataNeedsReview';

export type MetadataProviderId = 'anilist' | 'jikan' | 'tmdb' | 'omdb' | string;

export type MetadataImageKind =
  | 'poster'
  | 'backdrop'
  | 'banner'
  | 'screenshot'
  | 'trailer';

export type TitleMediaAssetKind =
  | 'poster'
  | 'backdrop'
  | 'banner'
  | 'screenshot'
  | 'trailerThumbnail'
  | 'localFrame';

export type TitleMediaAssetSource = MetadataProviderId | 'local' | 'cache';

export interface TitleMediaAsset {
  id: string;
  kind: TitleMediaAssetKind;
  url?: string;
  localPath?: string;
  displayUrl?: string;
  width?: number;
  height?: number;
  source: TitleMediaAssetSource;
  label?: string;
  episodeNumber?: number;
  confidence?: number;
  originalUrl?: string;
}

export interface TitleTrailer {
  site: 'youtube' | 'dailymotion' | 'unknown';
  id?: string;
  url?: string;
  thumbnailUrl?: string;
}

export interface TitleMediaBundle {
  posters?: TitleMediaAsset[];
  backdrops?: TitleMediaAsset[];
  banners?: TitleMediaAsset[];
  screenshots?: TitleMediaAsset[];
  trailerThumbnails?: TitleMediaAsset[];
  localFrames?: TitleMediaAsset[];
  trailer?: TitleTrailer | null;
}

export type RelatedRelationType =
  | 'prequel'
  | 'sequel'
  | 'side_story'
  | 'spin_off'
  | 'parent'
  | 'summary'
  | 'alternative'
  | 'adaptation'
  | 'character'
  | 'recommendation'
  | 'other';

export interface RelatedTitle {
  id: string;
  provider: 'anilist' | 'jikan' | 'tmdb' | 'local';
  providerId?: string | number;
  title: string;
  englishTitle?: string;
  nativeTitle?: string;
  romajiTitle?: string;
  relationType: RelatedRelationType;
  year?: number;
  format?: string;
  coverImage?: TitleMediaAsset;
  inLibrary?: boolean;
  localTitleId?: string;
  confidence?: number;
  externalUrl?: string;
}

export interface TitleMetadataExternalIds {
  anilist?: number;
  mal?: number;
  tmdb?: number;
  imdb?: string;
}

export interface MetadataPerson {
  name: string;
  role?: string;
  character?: string;
  imageUrl?: string;
}

/** @deprecated grouped relations — prefer relatedTitles */
export interface MetadataRelatedTitle {
  providerMediaId: string;
  title: string;
  year?: number;
  format?: string;
  relationType: string;
}

/** @deprecated grouped relations — prefer relatedTitles */
export interface MetadataRelations {
  sequel?: MetadataRelatedTitle[];
  prequel?: MetadataRelatedTitle[];
  sideStory?: MetadataRelatedTitle[];
  spinOff?: MetadataRelatedTitle[];
  alternativeVersion?: MetadataRelatedTitle[];
  recommendations?: MetadataRelatedTitle[];
  similarTitles?: MetadataRelatedTitle[];
}

export interface MetadataStaff {
  directors?: MetadataPerson[];
  writers?: MetadataPerson[];
  creators?: MetadataPerson[];
  producers?: MetadataPerson[];
  composers?: MetadataPerson[];
}

export interface StaffPerson {
  name: string;
  role?: string;
  imageUrl?: string;
}

export interface CharacterMetadata {
  id: string;
  provider: 'anilist' | 'jikan' | 'local';
  providerId?: string | number;
  name: string;
  nativeName?: string;
  aliases?: string[];
  image?: TitleMediaAsset;
  role?: 'main' | 'supporting' | 'background' | 'unknown';
  voiceActors?: StaffPerson[];
  colorHint?: string;
}

export interface EnrichedTitleMetadata {
  canonicalTitle: string;
  localizedTitle?: string;
  originalTitle?: string;
  englishTitle?: string;
  romajiTitle?: string;
  aliases?: string[];
  description?: string;
  shortDescription?: string;
  year?: number;
  startDate?: string;
  endDate?: string;
  type?: string;
  format?: string;
  status?: string;
  season?: string;
  episodeCount?: number;
  duration?: number;
  genres?: string[];
  tags?: string[];
  rating?: number;
  popularity?: number;
  ageRating?: string;
  studios?: string[];
  source?: string;
  country?: string;
  language?: string;
  /** Legacy flat URLs — kept for hero/cards */
  posterUrl?: string;
  backdropUrl?: string;
  bannerUrl?: string;
  logoUrl?: string;
  screenshots?: string[];
  trailerUrl?: string;
  trailerThumbnailUrl?: string;
  media?: TitleMediaBundle;
  relatedTitles?: RelatedTitle[];
  characters?: CharacterMetadata[];
  externalIds?: TitleMetadataExternalIds;
  externalUrl?: string;
  staff?: MetadataStaff;
  cast?: MetadataPerson[];
  voiceActors?: MetadataPerson[];
  /** @deprecated use relatedTitles */
  related?: MetadataRelations;
  sourceProvider: MetadataProviderId;
  providerMediaId: string;
  confidence: number;
}

export interface TitleMetadataCandidate {
  providerId: MetadataProviderId;
  providerMediaId: string;
  title: string;
  year?: number;
  confidence: number;
}

export interface TitleMetadataRecord {
  version: number;
  cacheKey: string;
  titleId: string;
  state: TitleMetadataState;
  metadata?: EnrichedTitleMetadata;
  candidates?: TitleMetadataCandidate[];
  confidence: number;
  /** Search query sent to metadata providers (parent title, episode suffix stripped). */
  matchQuery?: string;
  matchedProvider?: MetadataProviderId;
  matchedTitle?: string;
  appliedTo?: 'parentTitle' | 'episode' | 'file';
  posterSource?: 'manual' | 'online' | 'local' | 'episode' | 'placeholder';
  backdropSource?: 'manual' | 'online' | 'local' | 'placeholder';
  /** Cached media with local display URLs */
  cachedMedia?: TitleMediaBundle;
  posterLocalPath?: string;
  backdropLocalPath?: string;
  screenshotLocalPaths?: string[];
  posterDisplayUrl?: string;
  backdropDisplayUrl?: string;
  screenshotDisplayUrls?: string[];
  failedAt?: number;
  fetchedAt?: number;
  updatedAt: number;
}

export interface TitleMetadataImageResult {
  localPath?: string;
  displayUrl?: string;
  failed?: boolean;
}
