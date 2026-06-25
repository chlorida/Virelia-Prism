import { memo, useCallback, useMemo, useState } from 'react';

import type { TitleMediaAsset, TitleMediaBundle } from '../../../shared/titleMetadataTypes';

import { useI18n } from '../../i18n/I18nProvider';

import { openExternalUrl } from '../../lib/tauriCommands';



interface TitleMediaGalleryProps {

  media?: TitleMediaBundle;

  trailerUrl?: string;

  trailerThumbnailUrl?: string;

}



function normalizeImageKey(url: string): string {
  try {
    const parsed = new URL(url, 'https://local.invalid');
    const path = parsed.pathname.replace(/\/(?:hqdefault|mqdefault|maxresdefault|original)\./i, '/frame.');
    return `${parsed.hostname}${path}`.toLowerCase();
  } catch {
    return url.split('?')[0]?.toLowerCase() ?? url;
  }
}

function dedupeAssetsByUrl(assets: TitleMediaAsset[]): TitleMediaAsset[] {
  const seen = new Set<string>();
  const out: TitleMediaAsset[] = [];
  for (const asset of assets) {
    const src = asset.displayUrl ?? asset.url;
    const key = asset.kind === 'localFrame'
      ? asset.id
      : src ? normalizeImageKey(src) : asset.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset);
  }
  return out;
}

function assetSrc(asset: TitleMediaAsset): string | undefined {
  return asset.displayUrl ?? asset.url;
}



interface TrailerPlayback {

  watchUrl: string;

  embedUrl?: string;

  thumbnailUrl?: string;

}



function resolveTrailerPlayback(

  trailerUrl?: string,

  trailerThumbnailUrl?: string,

  media?: TitleMediaBundle

): TrailerPlayback | null {

  const watchUrl = media?.trailer?.url ?? trailerUrl;

  if (!watchUrl) return null;



  const youtubeMatch = watchUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);

  if (youtubeMatch) {

    const id = youtubeMatch[1];

    return {

      watchUrl: `https://www.youtube.com/watch?v=${id}`,

      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,

      thumbnailUrl: trailerThumbnailUrl

        ?? media?.trailer?.thumbnailUrl

        ?? media?.trailerThumbnails?.[0]?.displayUrl

        ?? media?.trailerThumbnails?.[0]?.url

        ?? `https://img.youtube.com/vi/${id}/hqdefault.jpg`,

    };

  }



  const dailymotionMatch = watchUrl.match(/dailymotion\.com\/(?:video|embed\/video)\/([a-zA-Z0-9]+)/);

  if (dailymotionMatch) {

    const id = dailymotionMatch[1];

    return {

      watchUrl: `https://www.dailymotion.com/video/${id}`,

      embedUrl: `https://www.dailymotion.com/embed/video/${id}?autoplay=1`,

      thumbnailUrl: trailerThumbnailUrl ?? media?.trailer?.thumbnailUrl ?? media?.trailerThumbnails?.[0]?.displayUrl,

    };

  }



  return {

    watchUrl,

    thumbnailUrl: trailerThumbnailUrl ?? media?.trailer?.thumbnailUrl ?? media?.trailerThumbnails?.[0]?.displayUrl,

  };

}



function GalleryStrip(props: {

  heading: string;

  assets: TitleMediaAsset[];

  onOpen: (src: string) => void;

}) {

  if (props.assets.length === 0) return null;

  return (

    <section className="title-media-gallery__section">

      <h3 className="title-detail-deep__subheading">{props.heading}</h3>

      <div className="title-media-gallery__strip" role="list">

        {props.assets.map((asset) => {

          const src = assetSrc(asset);

          if (!src) return null;

          return (

            <button

              key={asset.id}

              type="button"

              className="title-media-gallery__thumb-btn"

              onClick={() => props.onOpen(src)}

              role="listitem"

              title={asset.label}

            >

              <img src={src} alt="" className="title-media-gallery__thumb" loading="lazy" decoding="async" />

            </button>

          );

        })}

      </div>

    </section>

  );

}



export const TitleMediaGallery = memo(function TitleMediaGallery(props: TitleMediaGalleryProps) {

  const { t } = useI18n();

  const [lightbox, setLightbox] = useState<string | null>(null);

  const [trailerOpen, setTrailerOpen] = useState(false);

  const close = useCallback(() => setLightbox(null), []);

  const closeTrailer = useCallback(() => setTrailerOpen(false), []);



  const media = props.media;

  const trailer = useMemo(

    () => resolveTrailerPlayback(props.trailerUrl, props.trailerThumbnailUrl, media),

    [media, props.trailerThumbnailUrl, props.trailerUrl]

  );



  const screenshots = dedupeAssetsByUrl([
    ...(media?.localFrames ?? []),
    ...((media?.screenshots ?? []).filter((asset) => asset.kind === 'localFrame' || asset.kind === 'screenshot')),
  ]).slice(0, 24);
  const frameUrls = new Set(screenshots.map((asset) => assetSrc(asset)).filter((url): url is string => Boolean(url)));
  const posters = dedupeAssetsByUrl(media?.posters ?? []).slice(0, 8);
  const backdrops = dedupeAssetsByUrl([
    ...(media?.backdrops ?? []),
    ...(media?.banners ?? []),
  ]).filter((asset) => {
    const url = assetSrc(asset);
    return !url || !frameUrls.has(url);
  }).slice(0, 8);

  const hasGalleryContent = Boolean(trailer)
    || screenshots.length > 0
    || posters.length > 0
    || backdrops.length > 0
    || ((media?.trailerThumbnails?.length ?? 0) > 0);



  const openTrailer = () => {

    if (!trailer) return;

    if (trailer.embedUrl) {

      setTrailerOpen(true);

      return;

    }

    void openExternalUrl(trailer.watchUrl);

  };



  return (

    <section className="title-media-gallery">
      {!hasGalleryContent && (
        <div className="title-media-gallery__empty glass-inset">
          <strong>{t('media.titles.media.emptyTitle')}</strong>
          <p className="muted">{t('media.titles.media.emptyHint')}</p>
        </div>
      )}

      {trailer && (

        <section className="title-media-gallery__section">

          <h3 className="title-detail-deep__subheading">{t('media.titles.media.trailer')}</h3>

          <button

            type="button"

            className="title-detail-deep__trailer-link"

            onClick={openTrailer}

          >

            {trailer.thumbnailUrl ? (

              <img

                src={trailer.thumbnailUrl}

                alt=""

                className="title-detail-deep__trailer-thumb"

                loading="lazy"

                decoding="async"

              />

            ) : (

              t('media.titles.media.watchTrailer')

            )}

          </button>

        </section>

      )}



      <GalleryStrip

        heading={t('media.titles.media.screenshots')}

        assets={screenshots}

        onOpen={setLightbox}

      />



      {(media?.trailerThumbnails?.length ?? 0) > 0 && screenshots.length === 0 && (

        <GalleryStrip

          heading={t('media.titles.media.trailerPreview')}

          assets={media?.trailerThumbnails ?? []}

          onOpen={setLightbox}

        />

      )}



      <GalleryStrip

        heading={t('media.titles.media.posters')}

        assets={posters}

        onOpen={setLightbox}

      />



      <GalleryStrip

        heading={t('media.titles.media.backdrops')}

        assets={backdrops}

        onOpen={setLightbox}

      />



      {lightbox && (

        <div className="title-media-lightbox" role="dialog" aria-modal="true" onClick={close}>

          <button type="button" className="title-media-lightbox__close" onClick={close} aria-label={t('settings.close')}>

            ×

          </button>

          <img src={lightbox} alt="" className="title-media-lightbox__img" onClick={(e) => e.stopPropagation()} />

        </div>

      )}



      {trailerOpen && trailer?.embedUrl && (

        <div className="title-media-lightbox title-media-lightbox--video" role="dialog" aria-modal="true" onClick={closeTrailer}>

          <button type="button" className="title-media-lightbox__close" onClick={closeTrailer} aria-label={t('settings.close')}>

            ×

          </button>

          <div className="title-media-lightbox__video-wrap" onClick={(e) => e.stopPropagation()}>

            <iframe

              className="title-media-lightbox__video"

              src={trailer.embedUrl}

              title={t('media.titles.media.trailer')}

              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"

              allowFullScreen

            />

          </div>

        </div>

      )}

    </section>

  );

});

