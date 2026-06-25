import { memo, useMemo, useState } from 'react';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import { formatDuration } from '../lib/search';
import { useI18n } from '../i18n/I18nProvider';
import { getTitleProgressSummary, resolveTitlePlayTarget } from '../lib/mediaIntelligence/titlePlaybackService';
import {
  formatTitleCountDisplay,
  resolveTitleDisplayType,
  titleDisplayKindLabel,
} from '../lib/mediaIntelligence/titleDisplayUtils';
import {
  getArtworkPresentation,
  hasCachedOnlinePoster,
  pickTitleCoverItem,
  shouldRequestLocalThumbnail,
} from '../lib/mediaIntelligence/titleArtwork';
import { useTitleMetadata } from '../hooks/useTitleMetadata';
import { useMediaThumbnail } from './watch/useMediaThumbnail';
import { useCardTilt } from '../hooks/useCardTilt';
import { TitleCardFallback } from './titles/TitleCardFallback';

interface TitleMediaCardProps {
  title: LibraryTitle;
  selected?: boolean;
  featured?: boolean;
  playingId?: string;
  style?: React.CSSProperties;
  onOpen: () => void;
  onContinue: () => void;
  onShowEpisodes: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}

export const TitleMediaCard = memo(function TitleMediaCard(props: TitleMediaCardProps) {
  const { t } = useI18n();
  const { title } = props;
  const [artFailed, setArtFailed] = useState(false);
  const metaRecord = useTitleMetadata(title, props.featured ? 'critical' : 'high');
  const coverItem = useMemo(() => pickTitleCoverItem(title), [title]);
  const enableLocalThumb = shouldRequestLocalThumbnail(metaRecord);
  const { url: thumbUrl, loading: thumbLoading, rootRef } = useMediaThumbnail(coverItem, {
    priority: props.featured ? 'critical' : 'high',
    variant: 'large',
    lazy: !props.featured,
    enabled: enableLocalThumb,
  });
  const { frameRef, onPointerMove, onPointerLeave, tiltActive } = useCardTilt(true);

  const progress = getTitleProgressSummary(title);
  const playTarget = resolveTitlePlayTarget(title);
  const counts = formatTitleCountDisplay(title, t, formatDuration);
  const displayType = resolveTitleDisplayType(title);
  const presentation = getArtworkPresentation(title, metaRecord, thumbUrl, { artFailed });
  const artUrl = presentation.imageUrl;
  const showThumbLoading = !artUrl
    && !hasCachedOnlinePoster(metaRecord)
    && thumbLoading
    && enableLocalThumb;
  const isAudio = title.items.length > 0 && title.items.every((item) => item.kind === 'audio');
  const displayTitle = metaRecord?.metadata?.localizedTitle
    ?? metaRecord?.metadata?.canonicalTitle
    ?? title.displayTitle;
  const year = metaRecord?.metadata?.year ?? title.year;

  const isPlaying = Boolean(
    props.playingId && title.items.some((item) => item.id === props.playingId)
  );

  const kindLabel = titleDisplayKindLabel(title, t);

  const continueItem = progress.continueItem;
  const progressPct = continueItem?.durationSeconds && (continueItem.resumePositionSeconds ?? 0) > 0
    ? Math.min(100, ((continueItem.resumePositionSeconds ?? 0) / continueItem.durationSeconds) * 100)
    : 0;

  const isSeries = displayType === 'series' && title.uniqueEpisodeCount > 1;
  const primaryLabel = progress.hasProgress
    ? t('media.titles.continue')
    : isSeries
      ? t('media.titles.startWatching')
      : t('player.play');

  const metaLine = useMemo(() => {
    const parts: string[] = [];
    if (year != null && displayType !== 'series') parts.push(String(year));
    if (displayType === 'series') {
      if (counts.primary) parts.push(counts.primary);
      if (counts.secondary) parts.push(counts.secondary);
    } else if (displayType === 'ova' || displayType === 'special') {
      if (counts.secondary) parts.push(counts.secondary);
      else if (counts.primary && !counts.primary.toLowerCase().includes(kindLabel.toLowerCase())) {
        parts.push(counts.primary);
      }
    } else if (displayType === 'movie') {
      if (counts.primary && counts.primary !== kindLabel) parts.push(counts.primary);
      if (counts.secondary) parts.push(counts.secondary);
    } else {
      if (counts.primary) parts.push(counts.primary);
      if (counts.secondary) parts.push(counts.secondary);
    }
    return parts.join(' · ');
  }, [counts, displayType, kindLabel, year]);

  const cardClass = [
    'prism-title-card',
    `prism-title-card--${isAudio ? 'audio' : displayType}`,
    props.featured ? 'prism-title-card--featured' : '',
    props.selected ? 'is-selected' : '',
    isPlaying ? 'is-now-playing' : '',
    progress.hasProgress ? 'has-progress' : '',
    artUrl ? 'has-artwork' : '',
    presentation.imageKind === 'localThumbnail' ? 'has-local-thumb' : '',
    tiltActive ? 'prism-title-card--tilt' : '',
  ].filter(Boolean).join(' ');

  const mergeFrameRef = (node: HTMLDivElement | null) => {
    frameRef.current = node;
  };

  return (
    <article
      ref={rootRef}
      className={cardClass}
      style={props.style}
      onClick={props.onOpen}
      onContextMenu={props.onContextMenu}
      onDoubleClick={(event) => {
        if (!playTarget) return;
        event.preventDefault();
        props.onContinue();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          props.onOpen();
          return;
        }
        if (event.key === ' ' && playTarget) {
          event.preventDefault();
          props.onContinue();
        }
      }}
      onPointerMove={tiltActive ? onPointerMove : undefined}
      onPointerLeave={tiltActive ? onPointerLeave : undefined}
    >
      <div
        ref={mergeFrameRef}
        className="prism-title-card__frame"
      >
        {artUrl ? (
          <img
            className="prism-title-card__art"
            src={artUrl}
            alt=""
            decoding="async"
            draggable={false}
            onContextMenu={props.onContextMenu}
            style={{
              objectFit: presentation.objectFit,
              objectPosition: presentation.objectPosition,
            }}
            onError={() => setArtFailed(true)}
          />
        ) : (
          <TitleCardFallback
            title={displayTitle}
            mediaType={isAudio ? 'audio' : displayType}
            loading={showThumbLoading}
          />
        )}

        <div className="prism-title-card__glare" aria-hidden />
        <div className="prism-title-card__scrim" aria-hidden />
        <div className="prism-title-card__vignette" aria-hidden />

        <div className="prism-title-card__top">
          <span className={`prism-title-card__type prism-title-card__type--${displayType}`}>
            {kindLabel}
          </span>
        </div>

        {playTarget && (
          <button
            type="button"
            className="prism-title-card__play-hit"
            aria-label={primaryLabel}
            onClick={(event) => {
              event.stopPropagation();
              props.onContinue();
            }}
          >
            <span className="prism-title-card__play-icon" aria-hidden>▶</span>
          </button>
        )}

        <div className="prism-title-card__footer">
          <h3 className="prism-title-card__title" title={displayTitle}>
            {displayTitle}
          </h3>
          {metaLine && <p className="prism-title-card__meta">{metaLine}</p>}
          <div className="prism-title-card__actions">
            {playTarget && (
              <button
                type="button"
                className="prism-title-card__btn prism-title-card__btn--primary"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onContinue();
                }}
              >
                {primaryLabel}
              </button>
            )}
            {isSeries && (
              <button
                type="button"
                className="prism-title-card__btn prism-title-card__btn--secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onShowEpisodes();
                }}
              >
                {t('media.titles.episodesAction')}
              </button>
            )}
          </div>
        </div>

        {progress.hasProgress && (
          <div className="prism-title-card__progress" aria-hidden>
            <span style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>
    </article>
  );
});
