import { memo } from 'react';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import { formatDuration } from '../lib/search';
import { useI18n } from '../i18n/I18nProvider';
import { getTitleProgressSummary, resolveTitlePlayTarget } from '../lib/mediaIntelligence/titlePlaybackService';
import { formatTitleCountDisplay } from '../lib/mediaIntelligence/titleDisplayUtils';
import { MediaThumb } from './watch/MediaThumb';

interface TitleTableRowProps {
  title: LibraryTitle;
  selected?: boolean;
  style: React.CSSProperties;
  onOpen: () => void;
  onContinue: () => void;
  onShowEpisodes: () => void;
}

export const TITLE_ROW_HEIGHT = 112;

export const TitleTableRow = memo(function TitleTableRow(props: TitleTableRowProps) {
  const { t } = useI18n();
  const { title } = props;
  const heroItem = title.preferredItemId
    ? title.items.find((item) => item.id === title.preferredItemId) ?? title.items[0]
    : title.items[0];
  const progress = getTitleProgressSummary(title);
  const playTarget = resolveTitlePlayTarget(title);
  const counts = formatTitleCountDisplay(title, t, formatDuration);

  const kindLabel = (() => {
    switch (title.mediaType) {
      case 'movie': return t('media.titles.kind.movie');
      case 'ova': return t('media.titles.kind.ova');
      case 'special': return t('media.titles.kind.special');
      case 'series': return t('media.titles.kind.series');
      case 'album': return t('media.titles.kind.album');
      default: return title.items.length === 1 ? t('media.titles.kind.single') : t('media.titles.kind.group');
    }
  })();

  const cardClass = [
    'title-cinema-card',
    `title-cinema-card--${title.mediaType}`,
    props.selected ? 'is-selected' : '',
    progress.hasProgress ? 'has-progress' : '',
  ].filter(Boolean).join(' ');

  return (
    <article
      className={`${cardClass} virtual-title-row`}
      style={props.style}
      onClick={props.onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.onOpen();
        }
      }}
    >
      <div className="title-cinema-card__media">
        {heroItem ? (
          <MediaThumb item={heroItem} size="row" priority="normal" lazy />
        ) : (
          <div className="title-cinema-card__media-fallback" aria-hidden />
        )}
        <span className="title-cinema-card__type-badge">{kindLabel}</span>
        {progress.hasProgress && (
          <span className="title-cinema-card__progress-badge">{t('media.titles.inProgress')}</span>
        )}
      </div>
      <div className="title-cinema-card__body">
        <div className="title-cinema-card__headline">
          <strong className="title-cinema-card__title">
            {title.displayTitle}
            {title.year != null ? <span className="title-cinema-card__year"> ({title.year})</span> : null}
          </strong>
          {(title.mediaType === 'series' || title.totalFileCount > 1) && (
            <span className="title-cinema-card__count" title={counts.secondary ?? counts.primary}>
              {counts.pill}
            </span>
          )}
        </div>
        <p className="title-cinema-card__meta">
          {[counts.primary, counts.secondary].filter(Boolean).join(' · ')}
        </p>
        {(title.versionTags?.length ?? 0) > 0 && (
          <div className="title-cinema-card__chips">
            {(title.versionTags ?? []).slice(0, 2).map((tag) => (
              <span key={tag} className="meta-chip meta-chip--compact">{tag.toUpperCase()}</span>
            ))}
          </div>
        )}
        <div className="title-cinema-card__actions">
          {progress.hasProgress && playTarget && (
            <button
              type="button"
              className="media-row__play-btn"
              onClick={(event) => {
                event.stopPropagation();
                props.onContinue();
              }}
            >
              {t('media.titles.continue')}
            </button>
          )}
          {title.mediaType === 'series' && title.uniqueEpisodeCount > 1 && (
            <button
              type="button"
              className="ghost-button"
              onClick={(event) => {
                event.stopPropagation();
                props.onShowEpisodes();
              }}
            >
              {t('media.titles.episodesAction')}
            </button>
          )}
          {!(title.mediaType === 'series' && title.uniqueEpisodeCount > 1) && playTarget && (
            <button
              type="button"
              className="media-row__play-btn"
              onClick={(event) => {
                event.stopPropagation();
                props.onContinue();
              }}
            >
              {t('player.play')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
});
