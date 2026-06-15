import { memo, type ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';

export interface TitleDetailHeroProps {
  heroKey: string;
  title: string;
  subtitle?: string;
  year?: number;
  genres: string[];
  backdropUrl?: string;
  posterUrl?: string;
  rating?: number;
  /** Episode stat display as `local/total` (e.g. `5/12`). */
  episodeProgressLabel?: string;
  kindLabel: string;
  availabilityChips?: ReactNode;
  actions: ReactNode;
  metadataBusy?: boolean;
  hasHeroStats?: boolean;
  /** Library detail: local thumbnail poster styling. */
  posterUsesLocalStyle?: boolean;
  /** Library detail: file counts, format, duplicate notice. */
  metaLine?: string;
  /** Library detail: resume / in-progress label. */
  inProgressLabel?: string;
  /** Library detail: metadata refresh progress and notices. */
  statusFooter?: ReactNode;
}

function parseEpisodeProgress(label: string): { local: number; total: number } | null {
  const [localRaw, totalRaw] = label.split('/');
  const local = Number(localRaw);
  const total = Number(totalRaw);
  if (!Number.isFinite(local) || !Number.isFinite(total)) return null;
  return { local, total };
}

export const TitleDetailHero = memo(function TitleDetailHero(props: TitleDetailHeroProps) {
  const { t } = useI18n();
  const metadataBusy = props.metadataBusy ?? false;
  const episodeProgress = props.episodeProgressLabel
    ? parseEpisodeProgress(props.episodeProgressLabel)
    : null;
  const hasHeroStats = props.hasHeroStats ?? (props.rating != null || episodeProgress != null);

  return (
    <header
      key={props.heroKey}
      className={[
        'title-detail-hero',
        metadataBusy ? 'title-detail-hero--metadata-busy' : '',
        hasHeroStats ? 'title-detail-hero--with-stats' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="title-detail-hero__bg" aria-hidden>
        {props.backdropUrl ? (
          <div
            className={[
              'title-detail-hero__image',
              'title-detail-hero__image--crossfade',
              metadataBusy ? '' : 'title-detail-hero__image--ken-burns',
            ].filter(Boolean).join(' ')}
            style={{ backgroundImage: `url("${props.backdropUrl}")` }}
          />
        ) : (
          <div className="title-detail-hero__image title-detail-hero__image--fallback" />
        )}
        <div className="title-detail-hero__gradient" />
      </div>

      {props.rating != null && (
        <div
          className="title-detail-hero__stat title-detail-hero__stat--rating title-detail-hero__stat--enter-rating"
          aria-label={t('media.titles.detail.rating', { value: props.rating.toFixed(1) })}
        >
          <span className="title-detail-hero__stat-value">{props.rating.toFixed(1)}</span>
          <span className="title-detail-hero__stat-label">{t('media.titles.detail.ratingLabel')}</span>
        </div>
      )}

      {episodeProgress && (
        <div
          className="title-detail-hero__stat title-detail-hero__stat--episodes title-detail-hero__stat--enter-episodes"
          aria-label={t('media.library.episodesProgress', {
            local: episodeProgress.local,
            total: episodeProgress.total,
          })}
        >
          <span className="title-detail-hero__stat-value">
            <span className="title-detail-hero__stat-fraction">{episodeProgress.local}</span>
            <span className="title-detail-hero__stat-separator">/</span>
            <span className="title-detail-hero__stat-fraction title-detail-hero__stat-fraction--total">
              {episodeProgress.total}
            </span>
          </span>
          <span className="title-detail-hero__stat-label">{t('media.titles.episodeList')}</span>
        </div>
      )}

      <div className="title-detail-hero__content">
        {props.posterUrl && (
          <div className="title-detail-hero__poster title-detail-hero__poster--enter">
            <img
              src={props.posterUrl}
              alt=""
              className={props.posterUsesLocalStyle
                ? 'title-detail-hero__poster-img title-detail-hero__poster-img--local'
                : 'title-detail-hero__poster-img'}
              decoding="async"
            />
          </div>
        )}
        <div className="title-detail-hero__copy">
          <div className="title-detail-hero__status-badges">
            <span className="title-detail-hero__badge">{props.kindLabel}</span>
            {props.availabilityChips}
          </div>
          <h1 className="title-detail-hero__title title-detail-hero__title--enter">
            {props.title}
          </h1>
          {props.year != null && (
            <p className="title-detail-hero__year title-detail-hero__year--enter">{props.year}</p>
          )}
          {props.subtitle && (
            <p className="title-detail-hero__original title-detail-hero__original--enter">{props.subtitle}</p>
          )}
          {props.metaLine != null && (
            <p className="title-detail-hero__meta">{props.metaLine}</p>
          )}
          {props.genres.length > 0 && (
            <div className="title-detail-hero__genres">
              {props.genres.slice(0, 5).map((genre) => (
                <span key={genre} className="meta-chip meta-chip--compact">{genre}</span>
              ))}
            </div>
          )}
          {props.inProgressLabel && (
            <p className="title-detail-hero__progress">{props.inProgressLabel}</p>
          )}
          <div className="title-detail-hero__actions title-detail-hero__actions--enter">
            {props.actions}
          </div>
          {props.statusFooter}
        </div>
      </div>
    </header>
  );
});
