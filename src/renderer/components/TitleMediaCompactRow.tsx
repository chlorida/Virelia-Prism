import { memo, useMemo } from 'react';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import { formatDuration } from '../lib/search';
import { useI18n } from '../i18n/I18nProvider';
import { getTitleProgressSummary, resolveTitlePlayTarget } from '../lib/mediaIntelligence/titlePlaybackService';
import {
  formatTitleCountDisplay,
  resolveTitleDisplayType,
  titleDisplayKindLabel,
} from '../lib/mediaIntelligence/titleDisplayUtils';
import { pickTitleCoverItem, shouldRequestLocalThumbnail } from '../lib/mediaIntelligence/titleArtwork';
import { useTitleMetadata } from '../hooks/useTitleMetadata';
import { useMediaThumbnail } from './watch/useMediaThumbnail';
import { MediaThumb } from './watch/MediaThumb';

interface TitleMediaCompactRowProps {
  title: LibraryTitle;
  selected?: boolean;
  playingId?: string;
  onOpen: () => void;
  onContinue: () => void;
  onShowEpisodes: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}

export const TitleMediaCompactRow = memo(function TitleMediaCompactRow(props: TitleMediaCompactRowProps) {
  const { t } = useI18n();
  const { title } = props;
  const metaRecord = useTitleMetadata(title, 'high');
  const coverItem = useMemo(() => pickTitleCoverItem(title), [title]);
  const enableLocalThumb = shouldRequestLocalThumbnail(metaRecord);
  useMediaThumbnail(coverItem, {
    priority: 'idle',
    variant: 'large',
    lazy: true,
    enabled: enableLocalThumb,
  });

  const progress = getTitleProgressSummary(title);
  const playTarget = resolveTitlePlayTarget(title);
  const counts = formatTitleCountDisplay(title, t, formatDuration);
  const displayType = resolveTitleDisplayType(title);
  const kindLabel = titleDisplayKindLabel(title, t);
  const displayTitle = metaRecord?.metadata?.localizedTitle
    ?? metaRecord?.metadata?.canonicalTitle
    ?? title.displayTitle;
  const year = metaRecord?.metadata?.year ?? title.year;

  const isPlaying = Boolean(
    props.playingId && title.items.some((item) => item.id === props.playingId)
  );

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

  const metaParts = [kindLabel, year != null ? String(year) : null, counts.primary, counts.secondary]
    .filter(Boolean)
    .filter((part, index, arr) => arr.indexOf(part) === index);

  const techBadges = [
    ...(title.versionTags ?? []).slice(0, 2),
    ...(title.technicalTags ?? []).slice(0, 2),
  ].slice(0, 4);

  const rowClass = [
    'prism-compact-row',
    props.selected ? 'is-selected' : '',
    isPlaying ? 'is-now-playing' : '',
    progress.hasProgress ? 'has-progress' : '',
  ].filter(Boolean).join(' ');

  return (
    <article
      className={rowClass}
      role="button"
      tabIndex={0}
      onClick={props.onOpen}
      onContextMenu={props.onContextMenu}
      onDoubleClick={(event) => {
        event.preventDefault();
        if (playTarget) props.onContinue();
      }}
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
      aria-label={displayTitle}
    >
      <div className="prism-compact-row__thumb">
        {coverItem ? <MediaThumb item={coverItem} size="row" priority="normal" lazy /> : null}
        {isPlaying && (
          <span className="prism-compact-row__badge prism-compact-row__badge--live">
            {t('smartPanel.nowPlaying.label')}
          </span>
        )}
        {progressPct > 0 && (
          <div className="prism-compact-row__thumb-progress" aria-hidden>
            <span style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      <div className="prism-compact-row__body">
        <strong className="prism-compact-row__title" title={displayTitle}>{displayTitle}</strong>
        <span className="prism-compact-row__meta">{metaParts.join(' · ')}</span>
        {techBadges.length > 0 && (
          <span className="prism-compact-row__chips">
            {techBadges.map((tag) => (
              <span key={tag} className="meta-chip meta-chip--compact">{tag.toUpperCase()}</span>
            ))}
          </span>
        )}
      </div>

      <div className="prism-compact-row__actions">
        {playTarget && (
          <button
            type="button"
            className="prism-compact-row__btn prism-compact-row__btn--primary"
            aria-label={primaryLabel}
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
            className="prism-compact-row__btn"
            onClick={(event) => {
              event.stopPropagation();
              props.onShowEpisodes();
            }}
          >
            {t('media.titles.episodesAction')}
          </button>
        )}
      </div>
    </article>
  );
});
