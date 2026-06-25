import type { MediaItem } from '../../../shared/types';
import type { LibraryTitle } from './types';
import type { TitleMetadataRecord } from '../../../shared/titleMetadataTypes';
import { isAudioOnlyItems } from './audioAlbumService';
import { pickPrimaryBackdropUrl, pickPrimaryPosterUrl } from './metadata/metadataMediaAssets';
import { getTitleProgressSummary } from './titlePlaybackService';

/** Best local media item to sample a thumbnail frame from. */
export function pickTitleCoverItem(title: LibraryTitle): MediaItem | undefined {
  if (title.items.length === 0) return undefined;

  const { continueItem } = getTitleProgressSummary(title);
  if (continueItem) return continueItem;

  if (title.mediaType === 'album' || isAudioOnlyItems(title.items)) {
    const withAlbumArt = title.items.find((item) => item.albumArtPath);
    if (withAlbumArt) return withAlbumArt;
  }

  if (title.preferredItemId) {
    const preferred = title.items.find((item) => item.id === title.preferredItemId);
    if (preferred) return preferred;
  }

  if (title.episodes && title.episodes.length > 0) {
    const sorted = [...title.episodes].sort((a, b) => {
      const sa = a.seasonNumber ?? 0;
      const sb = b.seasonNumber ?? 0;
      if (sa !== sb) return sa - sb;
      return (a.episodeNumber ?? 9999) - (b.episodeNumber ?? 9999);
    });
    const first = sorted.find((ep) => ep.episodeNumber != null) ?? sorted[0];
    if (first?.preferredItemId) {
      return title.items.find((item) => item.id === first.preferredItemId);
    }
  }

  return title.items.find((item) => item.kind === 'video') ?? title.items[0];
}

function isConfirmedMetadata(meta?: TitleMetadataRecord): boolean {
  return meta?.state === 'metadataReady';
}

export function hasCachedOnlinePoster(meta?: TitleMetadataRecord): boolean {
  if (!meta) return false;
  if (meta.posterDisplayUrl) return true;
  if (pickPrimaryPosterUrl(meta.cachedMedia, meta.posterDisplayUrl)) return true;
  if (meta.metadata?.posterUrl && meta.state !== 'localOnly' && meta.state !== 'metadataFailed') {
    return true;
  }
  return isConfirmedMetadata(meta) && Boolean(meta.metadata?.posterUrl);
}

/** Local thumbnails load in parallel until an online poster is cached. */
export function shouldRequestLocalThumbnail(meta?: TitleMetadataRecord): boolean {
  if (hasCachedOnlinePoster(meta)) return false;
  return true;
}

function confirmedPosterUrl(meta?: TitleMetadataRecord): string | undefined {
  const cached = pickPrimaryPosterUrl(meta?.cachedMedia, meta?.posterDisplayUrl);
  if (cached) return cached;
  if (meta?.posterDisplayUrl) return meta.posterDisplayUrl;
  if (
    meta?.metadata?.posterUrl
    && meta.state !== 'localOnly'
    && meta.state !== 'metadataFailed'
  ) {
    return meta.metadata.posterUrl;
  }
  if (!isConfirmedMetadata(meta)) return undefined;
  return meta?.metadata?.posterUrl;
}

function confirmedBackdropUrl(meta?: TitleMetadataRecord): string | undefined {
  const cached = pickPrimaryBackdropUrl(meta?.cachedMedia, meta?.backdropDisplayUrl);
  if (cached) return cached;
  if (meta?.backdropDisplayUrl) return meta.backdropDisplayUrl;
  if (
    meta?.metadata?.backdropUrl
    && meta.state !== 'localOnly'
    && meta.state !== 'metadataFailed'
  ) {
    return meta.metadata.backdropUrl ?? meta.metadata.bannerUrl;
  }
  if (!isConfirmedMetadata(meta)) return undefined;
  return meta?.metadata?.backdropUrl
    ?? meta?.metadata?.bannerUrl;
}

export interface TitleArtworkSources {
  metadataUrl?: string;
  thumbnailUrl?: string;
  displayTitle: string;
  mediaType: LibraryTitle['mediaType'] | 'audio';
}

/** Poster chain: manual override → online poster → local thumbnail → placeholder */
export function resolveTitlePoster(
  title: LibraryTitle,
  metaRecord: TitleMetadataRecord | undefined,
  thumbnailUrl?: string
): string | undefined {
  return confirmedPosterUrl(metaRecord) ?? title.posterUrl ?? thumbnailUrl;
}

/** Backdrop chain: manual override → online banner/backdrop → local thumbnail */
export function resolveTitleBackdrop(
  title: LibraryTitle,
  metaRecord: TitleMetadataRecord | undefined,
  thumbnailUrl?: string
): string | undefined {
  return confirmedBackdropUrl(metaRecord) ?? thumbnailUrl;
}

/** Library card artwork: poster-first; wide layouts may fall back to backdrop. */
export function resolveCardArtwork(
  title: LibraryTitle,
  metaRecord: TitleMetadataRecord | undefined,
  thumbnailUrl?: string,
  displayMode: 'poster' | 'wide' = 'poster'
): string | undefined {
  const poster = resolveTitlePoster(title, metaRecord, thumbnailUrl);
  if (displayMode === 'wide' && !poster) {
    return resolveTitleBackdrop(title, metaRecord, thumbnailUrl);
  }
  return poster;
}

/** Detail hero: backdrop-first, then poster as blurred fallback. */
export function resolveHeroArtwork(
  title: LibraryTitle,
  metaRecord: TitleMetadataRecord | undefined,
  thumbnailUrl?: string
): { backdropUrl?: string; posterUrl?: string; heroUrl?: string } {
  const posterUrl = resolveTitlePoster(title, metaRecord, thumbnailUrl);
  const backdropUrl = confirmedBackdropUrl(metaRecord);
  const heroUrl = backdropUrl ?? posterUrl ?? thumbnailUrl;
  return { backdropUrl, posterUrl, heroUrl };
}

export function resolveTitleArtworkSources(
  title: LibraryTitle,
  metaRecord: TitleMetadataRecord | undefined,
  thumbnailUrl?: string
): TitleArtworkSources {
  const isAudio = title.items.length > 0 && title.items.every((item) => item.kind === 'audio');
  const mediaType = isAudio ? 'audio' : title.mediaType;
  const metadataUrl = resolveCardArtwork(title, metaRecord, thumbnailUrl, 'poster');

  return {
    metadataUrl,
    thumbnailUrl,
    displayTitle: metaRecord?.metadata?.localizedTitle
      ?? metaRecord?.metadata?.canonicalTitle
      ?? title.displayTitle,
    mediaType,
  };
}

export type TitleArtworkMode = 'poster' | 'backdrop' | 'auto';

export function pickTitleArtworkUrl(
  sources: TitleArtworkSources,
  mode: TitleArtworkMode = 'auto'
): string | undefined {
  const { metadataUrl, thumbnailUrl } = sources;
  if (mode === 'backdrop') return metadataUrl ?? thumbnailUrl;
  // Poster and card modes: confirmed online art beats local frame thumbnail.
  if (mode === 'poster' || mode === 'auto') return metadataUrl ?? thumbnailUrl;
  return metadataUrl ?? thumbnailUrl;
}

/** Unified artwork resolver for cards, hero, and detail views. */
export function getBestTitleArtwork(
  title: LibraryTitle,
  metaRecord: TitleMetadataRecord | undefined,
  thumbnailUrl: string | undefined,
  mode: TitleArtworkMode = 'auto'
): {
  url?: string;
  posterUrl?: string;
  backdropUrl?: string;
  sources: TitleArtworkSources;
} {
  const sources = resolveTitleArtworkSources(title, metaRecord, thumbnailUrl);
  const posterUrl = confirmedPosterUrl(metaRecord) ?? title.posterUrl;
  const backdropUrl = confirmedBackdropUrl(metaRecord) ?? title.backdropPath;
  const url = (() => {
    if (mode === 'backdrop') return backdropUrl ?? posterUrl ?? thumbnailUrl;
    if (mode === 'poster') return posterUrl ?? thumbnailUrl;
    return resolveCardArtwork(title, metaRecord, thumbnailUrl, 'poster');
  })();
  return { url, posterUrl, backdropUrl, sources };
}

export type ArtworkImageKind = 'poster' | 'backdrop' | 'localThumbnail' | 'fallback';

export interface ArtworkPresentation {
  imageUrl?: string;
  imageKind: ArtworkImageKind;
  objectFit: 'cover' | 'contain';
  objectPosition: string;
  shouldUseFallback: boolean;
}

/** Chooses artwork source and crop behavior for collection cards. */
export function getArtworkPresentation(
  title: LibraryTitle,
  metaRecord: TitleMetadataRecord | undefined,
  thumbnailUrl: string | undefined,
  options: { compact?: boolean; artFailed?: boolean } = {}
): ArtworkPresentation {
  const mode: TitleArtworkMode = options.compact ? 'auto' : 'poster';
  const artwork = getBestTitleArtwork(title, metaRecord, thumbnailUrl, mode);
  const posterUrl = artwork.posterUrl;
  const hasMetadataPoster = Boolean(posterUrl);
  const hasMetadataBackdrop = Boolean(artwork.backdropUrl);
  const hasLocalThumb = Boolean(thumbnailUrl);

  if (options.artFailed || !artwork.url) {
    return {
      imageUrl: undefined,
      imageKind: 'fallback',
      objectFit: 'cover',
      objectPosition: 'center center',
      shouldUseFallback: true,
    };
  }

  const url = artwork.url;
  let imageKind: ArtworkImageKind = 'poster';

  if (hasMetadataPoster && (url === posterUrl || url === metaRecord?.posterDisplayUrl)) {
    imageKind = 'poster';
  } else if (hasMetadataBackdrop && url === artwork.backdropUrl) {
    imageKind = 'backdrop';
  } else if (hasLocalThumb && url === thumbnailUrl) {
    imageKind = 'localThumbnail';
  } else if (artwork.sources.metadataUrl && url === artwork.sources.metadataUrl) {
    imageKind = hasMetadataBackdrop && url === artwork.backdropUrl ? 'backdrop' : 'poster';
  }

  let objectPosition = 'center center';
  if (imageKind === 'poster') {
    objectPosition = 'center top';
  } else if (imageKind === 'backdrop') {
    objectPosition = 'center 35%';
  } else if (imageKind === 'localThumbnail') {
    objectPosition = hasMetadataPoster ? 'center top' : 'center center';
  }

  const shouldUseFallback = imageKind === 'localThumbnail'
    && !hasMetadataPoster
    && !artwork.sources.metadataUrl
    && Boolean(options.artFailed);

  return {
    imageUrl: shouldUseFallback ? undefined : url,
    imageKind: shouldUseFallback ? 'fallback' : imageKind,
    objectFit: 'cover',
    objectPosition,
    shouldUseFallback,
  };
}

export function titleInitials(title: string): string {
  const stopWords = new Set(['the', 'a', 'an', 'of', 'and']);
  const words = title.trim().split(/\s+/).filter((word) => word && !stopWords.has(word.toLowerCase()));
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
}
