export type CatalogMediaType = 'movie' | 'series' | 'anime' | 'ova' | 'special';

export type LocalAvailability =
  | 'in_library'
  | 'partial'
  | 'metadata_only'
  | 'not_in_library';

export type UserTitleStatus = 'not_watched' | 'watching' | 'watched' | 'dropped' | 'interested';

export type MatchConfidence = 'confirmed' | 'likely' | 'possible' | 'rejected' | 'none';

export type MatchSource = 'auto' | 'manual' | 'filename' | 'provider' | 'user';

export interface CatalogTitle {
  catalogId: string;
  provider?: string;
  providerId?: string;
  title: string;
  originalTitle?: string;
  romanizedTitle?: string;
  year?: number;
  type: CatalogMediaType;
  synopsis?: string;
  shortDescription?: string;
  releaseDate?: string;
  runtimeMinutes?: number;
  episodeCount?: number;
  seasonCount?: number;
  genres: string[];
  rating?: number;
  ratingScale?: number;
  posterUrl?: string;
  backdropUrl?: string;
  franchiseId?: string;
  franchiseName?: string;
  studios: string[];
  countries: string[];
  languages: string[];
  contentWarnings: string[];
  source: string;
  sourceUrl?: string;
  fetchedAt?: string;
}

export interface CatalogSeason {
  catalogId: string;
  seasonNumber: number;
  title?: string;
  episodeCount: number;
  posterUrl?: string;
  airDate?: string;
}

export interface CatalogEpisode {
  catalogId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  synopsis?: string;
  stillUrl?: string;
  airDate?: string;
  runtimeMinutes?: number;
  localMediaId?: string;
}

export interface CatalogPerson {
  personId: string;
  name: string;
  role?: string;
  characterName?: string;
  photoUrl?: string;
  knownFor?: string[];
}

export interface CatalogStudio {
  studioId: string;
  name: string;
  logoUrl?: string;
}

export interface WatchOption {
  providerId: string;
  providerName: string;
  providerLogoUrl?: string;
  type: 'subscription' | 'rent' | 'buy' | 'free' | 'unknown';
  region: string;
  url?: string;
  verified: boolean;
  source: string;
  fetchedAt: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ReviewSummary {
  catalogId: string;
  source: string;
  rating?: number;
  ratingScale?: number;
  criticsScore?: number;
  audienceScore?: number;
  reviewCount?: number;
  url?: string;
  fetchedAt: string;
}

export interface ReviewItem {
  id: string;
  catalogId: string;
  source: string;
  author?: string;
  rating?: number;
  title?: string;
  excerpt: string;
  url?: string;
  date?: string;
  spoiler?: boolean;
}

export interface TitleMatchRecord {
  localTitleId: string;
  catalogId?: string;
  matchConfidence: MatchConfidence;
  matchSource: MatchSource;
  rejectedCatalogIds: string[];
  lastMatchedAt?: string;
}

export interface RecommendationItem {
  catalogId?: string;
  localTitleId?: string;
  title: string;
  year?: number;
  type: CatalogMediaType;
  posterUrl?: string;
  genres?: string[];
  formatKind?: string;
  popularity?: number;
  localAvailability: LocalAvailability;
  reason: string;
  reasonKey: string;
  score: number;
}

export interface MetadataSearchResult {
  catalogId: string;
  provider: string;
  providerId: string;
  title: string;
  originalTitle?: string;
  year?: number;
  type: CatalogMediaType;
  posterUrl?: string;
  overview?: string;
  genres?: string[];
  formatKind?: string;
  popularity?: number;
  isAdult?: boolean;
  confidence: number;
  source: string;
}
