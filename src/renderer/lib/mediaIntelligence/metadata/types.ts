export type MetadataMediaKind = 'movie' | 'series' | 'anime' | 'unknown';

export interface MetadataSearchQuery {
  title: string;
  kind: MetadataMediaKind;
  year?: number;
  season?: number;
  episode?: number;
  language?: string;
}

export interface MetadataSearchResult {
  providerId: string;
  providerMediaId: string;
  title: string;
  year?: number;
  kind: MetadataMediaKind;
  confidence: number;
}

export interface MediaMetadata {
  providerId: string;
  providerMediaId: string;
  kind: MetadataMediaKind;
  title: string;
  localizedTitle?: string;
  localizedTitleByLanguage?: Record<string, string>;
  originalTitle?: string;
  overview?: string;
  year?: number;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  posterUrl?: string;
  backdropUrl?: string;
  genres?: string[];
  relatedIds?: string[];
  confidence: number;
}

import type { EnrichedTitleMetadata } from '../../../../shared/titleMetadataTypes';

export interface MetadataProvider {
  id: string;
  name: string;
  search(query: MetadataSearchQuery): Promise<MetadataSearchResult[]>;
  getDetails(id: string, language: string, confidence?: number): Promise<EnrichedTitleMetadata | MediaMetadata | null>;
}
