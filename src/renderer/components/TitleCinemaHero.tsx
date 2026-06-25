import { memo } from 'react';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import { formatDuration } from '../lib/search';
import { useI18n } from '../i18n/I18nProvider';
import { getTitleProgressSummary, resolveTitlePlayTarget } from '../lib/mediaIntelligence/titlePlaybackService';
import { formatTitleCountDisplay } from '../lib/mediaIntelligence/titleDisplayUtils';
import { useMediaThumbnail } from './watch/useMediaThumbnail';
import { MediaThumb } from './watch/MediaThumb';

interface TitleCinemaHeroProps {
  featured?: LibraryTitle;
  onOpen: (title: LibraryTitle) => void;
  onContinue: (title: LibraryTitle) => void;
}

export const TitleCinemaHero = memo(function TitleCinemaHero(props: TitleCinemaHeroProps) {
  const { t } = useI18n();
  const { featured } = props;
  const heroItem = featured
    ? (featured.preferredItemId
      ? featured.items.find((item) => item.id === featured.preferredItemId) ?? featured.items[0]
      : featured.items[0])
    : undefined;
  const { url: backdropUrl } = useMediaThumbnail(heroItem, { priority: 'high', variant: 'large', lazy: false });

  if (!featured || !heroItem) return null;

  const progress = getTitleProgressSummary(featured);
  const playTarget = resolveTitlePlayTarget(featured);
  const counts = formatTitleCountDisplay(featured, t, formatDuration);
  const kindLabel = t(`media.titles.kind.${featured.mediaType === 'unknown' ? 'group' : featured.mediaType}`);

  return (
    <section className="title-cinema-hero glass-inset" aria-label={featured.displayTitle}>
      <div className="title-cinema-hero__bg" aria-hidden>
        {backdropUrl ? (
          <div className="title-cinema-hero__backdrop" style={{ backgroundImage: `url("${backdropUrl}")` }} />
        ) : (
          <div className="title-cinema-hero__backdrop title-cinema-hero__backdrop--fallback" />
        )}
        <div className="title-cinema-hero__overlay" />
      </div>

      <div className="title-cinema-hero__content">
        <div className="title-cinema-hero__poster">
          <MediaThumb item={heroItem} size="row" priority="high" lazy={false} />
        </div>
        <div className="title-cinema-hero__copy">
          <span className="title-cinema-hero__eyebrow">{t('media.titles.heroEyebrow')}</span>
          <span className="title-cinema-hero__badge">{kindLabel}</span>
          <h3 className="title-cinema-hero__title">
            {featured.displayTitle}
            {featured.year != null ? <span className="title-cinema-hero__year"> ({featured.year})</span> : null}
          </h3>
          <p className="title-cinema-hero__meta">
            {[counts.primary, counts.secondary, progress.hasProgress ? t('media.titles.inProgress') : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="title-cinema-hero__actions">
            {progress.hasProgress && playTarget && (
              <button type="button" className="primary-action" onClick={() => props.onContinue(featured)}>
                {t('media.titles.continueWatching')}
              </button>
            )}
            {playTarget && (
              <button
                type="button"
                className={progress.hasProgress ? 'pill-button pill-button--accent' : 'primary-action'}
                onClick={() => props.onContinue(featured)}
              >
                {progress.hasProgress ? t('media.titles.startOver') : t('media.titles.startWatching')}
              </button>
            )}
            {featured.mediaType === 'series' && featured.uniqueEpisodeCount > 1 && (
              <button type="button" className="ghost-button" onClick={() => props.onOpen(featured)}>
                {t('media.titles.episodesAction')}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
});

export { pickFeaturedTitle } from '../lib/mediaIntelligence/titleShelfUtils';
