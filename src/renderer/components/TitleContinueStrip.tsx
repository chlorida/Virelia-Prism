import { memo } from 'react';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import { useI18n } from '../i18n/I18nProvider';
import { getTitleProgressSummary, resolveTitlePlayTarget } from '../lib/mediaIntelligence/titlePlaybackService';
import { titleDisplayKindLabel } from '../lib/mediaIntelligence/titleDisplayUtils';
import { pickTitleCoverItem, shouldRequestLocalThumbnail } from '../lib/mediaIntelligence/titleArtwork';
import { useTitleMetadata } from '../hooks/useTitleMetadata';
import { useMediaThumbnail } from './watch/useMediaThumbnail';
import { MediaThumb } from './watch/MediaThumb';

interface TitleContinueStripProps {
  title: LibraryTitle;
  variant?: 'video' | 'music';
  onOpen: (title: LibraryTitle) => void;
  onContinue: (title: LibraryTitle) => void;
  onOpenPlayer?: () => void;
}

export const TitleContinueStrip = memo(function TitleContinueStrip(props: TitleContinueStripProps) {
  const { t } = useI18n();
  const { title } = props;
  const progress = getTitleProgressSummary(title);
  const playTarget = resolveTitlePlayTarget(title);
  const coverItem = pickTitleCoverItem(title);
  const metaRecord = useTitleMetadata(title, 'critical');
  const enableLocalThumb = shouldRequestLocalThumbnail(metaRecord);
  useMediaThumbnail(coverItem, {
    priority: 'idle',
    variant: 'large',
    lazy: !enableLocalThumb,
    enabled: enableLocalThumb,
  });

  if (!progress.hasProgress || !playTarget) return null;

  const continueItem = progress.continueItem;
  const progressPct = continueItem?.durationSeconds && (continueItem.resumePositionSeconds ?? 0) > 0
    ? Math.min(100, ((continueItem.resumePositionSeconds ?? 0) / continueItem.durationSeconds) * 100)
    : 0;
  const kindLabel = titleDisplayKindLabel(title, t);
  const isMusic = props.variant === 'music' || title.mediaType === 'album';
  const isSeries = !isMusic && title.mediaType === 'series' && title.uniqueEpisodeCount > 1;
  const eyebrowLabel = isMusic
    ? t('media.library.continueListening')
    : t('media.titles.continueWatching');
  const continueLabel = isMusic ? t('media.library.continueListening') : t('media.titles.continue');
  const episodeLabel = isSeries && continueItem
    ? title.episodes?.find((ep) => ep.versions.some((v) => v.itemId === continueItem.id))?.displayTitle
    : isMusic && continueItem
      ? continueItem.title
      : undefined;
  const hasVideo = playTarget.item.kind === 'video';

  return (
    <section className={['title-continue-strip title-continue-strip--hero prism-stagger-item', isMusic ? 'title-continue-strip--music' : ''].filter(Boolean).join(' ')} aria-label={eyebrowLabel}>
      <div className="title-continue-strip__thumb">
        {coverItem ? (
          <MediaThumb
            item={coverItem}
            size="row"
            priority="high"
            lazy={!enableLocalThumb}
            enabled={enableLocalThumb}
          />
        ) : null}
      </div>
      <div className="title-continue-strip__copy">
        <span className="title-continue-strip__eyebrow">{eyebrowLabel}</span>
        <strong className="title-continue-strip__title" title={title.displayTitle}>
          {title.displayTitle}
        </strong>
        <div className="title-continue-strip__meta">
          <span className="title-continue-strip__type">{kindLabel}</span>
          {episodeLabel && (
            <span className={isMusic ? 'title-continue-strip__track' : 'title-continue-strip__episode'}>{episodeLabel}</span>
          )}
          {progressPct > 0 && (
            <span className="title-continue-strip__pct">{Math.round(progressPct)}%</span>
          )}
        </div>
        {progressPct > 0 && (
          <div className="title-continue-strip__progress" aria-hidden>
            <span style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>
      <div className="title-continue-strip__actions">
        <button type="button" className="primary-action" onClick={() => props.onContinue(title)}>
          {continueLabel}
        </button>
        {hasVideo && props.onOpenPlayer && (
          <button type="button" className="ghost-button" onClick={props.onOpenPlayer}>
            {t('player.openPlayer')}
          </button>
        )}
        {isSeries && (
          <button type="button" className="ghost-button" onClick={() => props.onOpen(title)}>
            {t('media.titles.episodesAction')}
          </button>
        )}
      </div>
    </section>
  );
});
