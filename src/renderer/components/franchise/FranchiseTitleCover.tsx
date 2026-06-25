import { memo, useMemo, useState } from 'react';
import type { LibraryTitle } from '../../lib/mediaIntelligence/types';
import type { FranchiseCatalogTitle } from '../../lib/mediaIntelligence/franchise/franchiseCatalog';
import { pickTitleCoverItem, shouldRequestLocalThumbnail } from '../../lib/mediaIntelligence/titleArtwork';
import { useTitleMetadata } from '../../hooks/useTitleMetadata';
import { useFranchiseArtworkPoster } from '../../hooks/useFranchiseArtwork';
import { useMediaThumbnail } from '../watch/useMediaThumbnail';
import { TitleCardFallback } from '../titles/TitleCardFallback';

interface FranchiseTitleCoverProps {
  title: string;
  mediaType: string;
  posterUrl?: string;
  localTitle?: LibraryTitle;
  variant?: 'poster' | 'banner';
  /** Stable cache key for online artwork lookup (franchise or catalog id). */
  artworkKey?: string;
  /** Query used when fetching artwork online. */
  searchTitle?: string;
  /** Prefer AniList/catalog artwork over dark local video thumbnails. */
  preferCatalogArtwork?: boolean;
}

export const FranchiseTitleCover = memo(function FranchiseTitleCover(props: FranchiseTitleCoverProps) {
  const [failed, setFailed] = useState(false);
  const preferCatalogArtwork = props.preferCatalogArtwork ?? Boolean(props.artworkKey);
  const coverItem = useMemo(
    () => (!preferCatalogArtwork && props.localTitle ? pickTitleCoverItem(props.localTitle) : undefined),
    [preferCatalogArtwork, props.localTitle]
  );
  const metaRecord = useTitleMetadata(
    preferCatalogArtwork ? undefined : props.localTitle,
    props.localTitle ? 'high' : 'low'
  );
  const enableLocalThumb = props.localTitle && !preferCatalogArtwork
    ? shouldRequestLocalThumbnail(metaRecord)
    : false;
  const { url: thumbUrl } = useMediaThumbnail(coverItem, {
    priority: 'high',
    variant: props.variant === 'banner' ? 'large' : 'large',
    lazy: true,
    enabled: enableLocalThumb,
  });

  const fetchedPoster = useFranchiseArtworkPoster(
    props.artworkKey,
    props.searchTitle,
    Boolean(props.artworkKey && props.searchTitle?.trim())
  );

  const onlinePoster = metaRecord?.posterDisplayUrl ?? metaRecord?.metadata?.posterUrl;
  const remoteUrl = preferCatalogArtwork
    ? (props.posterUrl ?? fetchedPoster ?? onlinePoster ?? thumbUrl)
    : (props.posterUrl ?? thumbUrl ?? fetchedPoster ?? onlinePoster);
  const src = remoteUrl;

  if (src && !failed) {
    return (
      <img
        key={src}
        src={src}
        alt=""
        className={`franchise-cover franchise-cover--${props.variant ?? 'poster'}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <TitleCardFallback
      title={props.title}
      mediaType={props.mediaType}
      size="embed"
    />
  );
});

export function catalogMediaType(catalog: FranchiseCatalogTitle): string {
  return catalog.type;
}
