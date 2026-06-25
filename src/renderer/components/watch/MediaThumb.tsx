import { memo } from 'react';
import type { MediaItem } from '../../../shared/types';
import { resolveMediaDisplay } from '../../lib/mediaIntelligence/mediaDisplay';
import { useMediaDisplayLanguage } from '../../hooks/useMediaDisplayLanguage';
import { useMediaThumbnail, type UseMediaThumbnailOptions } from './useMediaThumbnail';

interface MediaThumbProps extends UseMediaThumbnailOptions {
  item: MediaItem;
  size?: 'sm' | 'md' | 'hero' | 'banner' | 'row' | 'row-audio' | 'player';
  className?: string;
}

function titleInitial(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
}

export const MediaThumb = memo(function MediaThumb(props: MediaThumbProps) {
  const { item, size = 'md', className, priority, variant, lazy } = props;
  const lang = useMediaDisplayLanguage();
  const display = resolveMediaDisplay(item, { language: lang });
  const resolvedVariant = variant ?? (size === 'hero' || size === 'banner' ? 'large' : 'small');
  const useLazy = lazy ?? (size === 'row' || size === 'sm' || size === 'md');
  const { url, loading, record, rootRef } = useMediaThumbnail(item, {
    priority,
    variant: resolvedVariant,
    lazy: useLazy,
  });
  const kind = item.kind;
  const isVideo = kind === 'video';
  const terminalFail = record?.status === 'failed'
    || record?.status === 'ffmpeg-missing'
    || record?.status === 'file-missing'
    || record?.status === 'path-not-allowed'
    || record?.status === 'unsupported';
  const showShimmer = !url && (loading || record?.status === 'queued' || record?.status === 'generating');
  const initial = titleInitial(display.title);

  return (
    <div
      ref={rootRef}
      className={[
        'media-thumb',
        `media-thumb--${size}`,
        `media-thumb--${kind}`,
        showShimmer ? 'media-thumb--loading' : '',
        terminalFail && !url ? 'media-thumb--placeholder' : '',
        url ? 'media-thumb--ready' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      aria-hidden
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="media-thumb__img"
          decoding="async"
          draggable={false}
        />
      ) : (
        <>
          <span className="media-thumb__backdrop" aria-hidden />
          {showShimmer && <span className="media-thumb__shimmer" />}
          <span className="media-thumb__initial">{initial}</span>
          <span className="media-thumb__glyph">{isVideo ? '▶' : '♪'}</span>
          {display.episodeLabel && isVideo && (
            <span className="media-thumb__ep">{display.episodeLabel}</span>
          )}
        </>
      )}
      {isVideo && <span className="media-thumb__shine" />}
      {isVideo && url && <span className="media-thumb__vignette" aria-hidden />}
    </div>
  );
});
