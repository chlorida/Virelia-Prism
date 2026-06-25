import { memo, useEffect, useMemo, useState } from 'react';
import type { LibraryTitle } from '../../lib/mediaIntelligence/types';
import type { FranchiseWatchOrderMode } from '../../lib/mediaIntelligence/franchise/franchiseCatalog';
import type { FranchiseTitleView } from '../../lib/mediaIntelligence/franchise/franchiseService';
import {
  buildFranchiseHubView,
} from '../../lib/mediaIntelligence/franchise/franchiseService';
import { getTitleProgressSummary, resolveTitlePlayTarget } from '../../lib/mediaIntelligence/titlePlaybackService';
import {
  formatFranchiseTypeSummary,
  orderModeUsesFallback,
  resolveFranchiseStartLabel,
  resolveTimelinePlayLabel,
  formatTimelineCount,
  timelinePositionNote,
} from '../../lib/mediaIntelligence/libraryDisplayUtils';
import { getBackdropForTitle, getPosterForTitle } from '../../lib/metadata/imageResolver';
import { refreshTitleMetadata } from '../../lib/mediaIntelligence/metadata/titleMetadataService';
import { useFranchiseArtworkPoster } from '../../hooks/useFranchiseArtwork';
import { useI18n } from '../../i18n/I18nProvider';
import { FranchiseTitleCover } from './FranchiseTitleCover';
import { LibraryContextNav } from '../library/LibraryContextNav';
import { playUiSound } from '../../services/uiAudioService';
import { requestFranchiseArtworkPoster } from '../../lib/mediaIntelligence/franchise/franchiseArtworkService';

const ORDER_HINT_KEYS: Record<FranchiseWatchOrderMode, Parameters<ReturnType<typeof useI18n>['t']>[0]> = {
  release: 'media.franchise.orderHint.release',
  recommended: 'media.franchise.orderHint.recommended',
  chronological: 'media.franchise.orderHint.chronological',
};

interface FranchiseTitleRowProps {
  entry: FranchiseTitleView;
  franchiseId: string;
  index: number;
  entries: FranchiseTitleView[];
  orderMode: FranchiseWatchOrderMode;
  onOpenLocalTitle?: (titleId: string) => void;
  onOpenCatalogTitle?: (catalogTitleId: string, franchiseId?: string) => void;
  onPlayLocalTitle?: (titleId: string) => void;
}

function FranchiseTitleRow(props: FranchiseTitleRowProps) {
  const { t } = useI18n();
  const { entry } = props;

  const openDetails = () => {
    if (entry.inLibrary && entry.localTitleId) {
      props.onOpenLocalTitle?.(entry.localTitleId);
      return;
    }
    props.onOpenCatalogTitle?.(entry.catalogTitle.catalogTitleId, props.franchiseId);
  };

  const actionLabel = resolveTimelinePlayLabel(entry, t);

  const handleAction = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    if (entry.inLibrary && entry.localTitleId) {
      props.onPlayLocalTitle?.(entry.localTitleId);
      return;
    }
    props.onOpenCatalogTitle?.(entry.catalogTitle.catalogTitleId, props.franchiseId);
  };

  const statusClass = entry.libraryStatus === 'in_library'
    ? 'franchise-status-badge--in'
    : entry.libraryStatus === 'possible_match'
      ? 'franchise-status-badge--possible'
      : 'franchise-status-badge--out';

  const statusLabel = entry.libraryStatus === 'in_library'
    ? t('media.library.statusInLibrary')
    : entry.libraryStatus === 'possible_match'
      ? t('media.franchise.possibleMatch')
      : t('media.library.statusNotInLibrary');

  const year = entry.catalogTitle.releaseDate.slice(0, 4);
  const orderLabel = String(props.index + 1).padStart(2, '0');
  const countLabel = formatTimelineCount(entry, t);
  const positionNote = timelinePositionNote(entry, props.index, props.entries, props.orderMode, t);

  return (
    <article
      className={[
        'franchise-timeline-row',
        entry.inLibrary ? 'franchise-timeline-row--in-library' : '',
        entry.libraryStatus === 'possible_match' ? 'franchise-timeline-row--possible' : '',
      ].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      onClick={openDetails}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetails();
        }
      }}
    >
      <span className="franchise-timeline-row__order" aria-hidden>{orderLabel}</span>
      <div className="franchise-timeline-row__poster">
        <FranchiseTitleCover
          title={entry.catalogTitle.displayTitle}
          mediaType={entry.catalogTitle.type}
          posterUrl={entry.catalogTitle.posterUrl}
          artworkKey={entry.catalogTitle.catalogTitleId}
          searchTitle={entry.catalogTitle.displayTitle}
          preferCatalogArtwork
        />
      </div>
      <div className="franchise-timeline-row__body">
        <strong className="franchise-timeline-row__title">{entry.catalogTitle.displayTitle}</strong>
        <p className="franchise-timeline-row__meta muted">
          {[entry.catalogTitle.type.toUpperCase(), year].filter(Boolean).join(' · ')}
        </p>
        <div className="franchise-timeline-row__badges">
          <span className={`franchise-status-badge ${statusClass}`}>{statusLabel}</span>
          {countLabel && <span className="franchise-episodes-badge">{countLabel}</span>}
        </div>
        {positionNote && (
          <p className="franchise-timeline-row__note muted">{positionNote}</p>
        )}
      </div>
      <div className="franchise-timeline-row__actions">
        <button type="button" className="ghost-button franchise-timeline-row__btn franchise-timeline-row__btn--primary" onClick={handleAction}>
          {actionLabel}
        </button>
        {entry.inLibrary && (
          <button
            type="button"
            className="ghost-button franchise-timeline-row__btn franchise-timeline-row__btn--secondary"
            onClick={(event) => {
              event.stopPropagation();
              openDetails();
            }}
          >
            {t('media.search.openDetails')}
          </button>
        )}
      </div>
    </article>
  );
}

interface FranchiseTitleListProps {
  heading: string;
  franchiseId: string;
  entries: FranchiseTitleView[];
  orderMode: FranchiseWatchOrderMode;
  emptyLabel?: string;
  onOpenLocalTitle?: (titleId: string) => void;
  onOpenCatalogTitle?: (catalogTitleId: string, franchiseId?: string) => void;
  onPlayLocalTitle?: (titleId: string) => void;
}

export const FranchiseTitleList = memo(function FranchiseTitleList(props: FranchiseTitleListProps) {
  const { t } = useI18n();
  if (props.entries.length === 0) {
    if (!props.emptyLabel) return null;
    return (
      <section className="franchise-title-list franchise-title-list--empty">
        {props.heading ? <h3 className="library-section-heading">{props.heading}</h3> : null}
        <p className="muted franchise-title-list__empty">{props.emptyLabel}</p>
      </section>
    );
  }
  return (
    <section className="franchise-title-list">
      {props.heading ? <h3 className="library-section-heading">{props.heading}</h3> : null}
      <div className="franchise-timeline">
        {props.entries.map((entry, index) => (
          <FranchiseTitleRow
            key={entry.catalogTitle.catalogTitleId}
            franchiseId={props.franchiseId}
            entry={entry}
            index={index}
            entries={props.entries}
            orderMode={props.orderMode}
            onOpenLocalTitle={props.onOpenLocalTitle}
            onOpenCatalogTitle={props.onOpenCatalogTitle}
            onPlayLocalTitle={props.onPlayLocalTitle}
          />
        ))}
      </div>
      <p className="franchise-timeline__hint muted">{t('media.franchise.timelineClickHint')}</p>
    </section>
  );
});

interface FranchiseOrderSwitcherProps {
  value: FranchiseWatchOrderMode;
  onChange: (mode: FranchiseWatchOrderMode) => void;
  showFallbackWarning?: boolean;
}

export const FranchiseOrderSwitcher = memo(function FranchiseOrderSwitcher(props: FranchiseOrderSwitcherProps) {
  const { t } = useI18n();
  const modes: FranchiseWatchOrderMode[] = ['release', 'recommended', 'chronological'];

  return (
    <div className="franchise-order-block">
      <h3 className="library-section-heading">{t('media.franchise.orderLabel')}</h3>
      <div className="franchise-order-switcher" role="group" aria-label={t('media.franchise.orderLabel')}>
        {modes.map((mode) => (
          <button
            key={mode}
            type="button"
            className={props.value === mode ? 'franchise-order-btn is-active' : 'franchise-order-btn'}
            aria-pressed={props.value === mode}
            onClick={() => {
              if (props.value !== mode) playUiSound('tab');
              props.onChange(mode);
            }}
          >
            {t(`media.franchise.order.${mode}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>
      <p className="franchise-order-block__hint muted">{t(ORDER_HINT_KEYS[props.value])}</p>
      <p className="franchise-order-block__reorder muted">{t('media.franchise.orderReorderHint')}</p>
      {props.showFallbackWarning && (
        <p className="franchise-order-block__warning" role="status">{t('media.franchise.orderFallbackWarning')}</p>
      )}
      {props.value === 'chronological' && (
        <p className="franchise-order-block__chrono muted">{t('media.franchise.chronologicalNote')}</p>
      )}
    </div>
  );
});

interface FranchiseHubPanelProps {
  franchiseId: string;
  libraryTitles: LibraryTitle[];
  onBack: () => void;
  onNavigateLibrary?: () => void;
  onOpenLocalTitle?: (titleId: string) => void;
  onOpenCatalogTitle?: (catalogTitleId: string, franchiseId?: string) => void;
  onPlayTitle?: (titleId: string) => void;
}

export const FranchiseHubPanel = memo(function FranchiseHubPanel(props: FranchiseHubPanelProps) {
  const { t } = useI18n();
  const [orderMode, setOrderMode] = useState<FranchiseWatchOrderMode>('release');

  const hub = useMemo(
    () => buildFranchiseHubView(props.franchiseId, props.libraryTitles, orderMode),
    [props.franchiseId, props.libraryTitles, orderMode]
  );

  useEffect(() => {
    if (!hub) return;
    requestFranchiseArtworkPoster(hub.franchise.franchiseId, hub.franchise.franchiseName);
    for (const entry of hub.titles) {
      requestFranchiseArtworkPoster(
        entry.catalogTitle.catalogTitleId,
        entry.catalogTitle.displayTitle
      );
    }
  }, [hub]);

  const fetchedFranchisePoster = useFranchiseArtworkPoster(
    props.franchiseId,
    hub?.franchise.franchiseName,
    Boolean(hub && !hub.franchise.posterUrl)
  );

  const firstLocal = hub?.titles.find((entry) => entry.inLibrary && entry.localTitleId);
  const heroPoster = getPosterForTitle({
    localTitle: firstLocal?.localTitle,
    franchisePosterUrl: hub?.franchise.posterUrl ?? fetchedFranchisePoster,
    titleLabel: hub?.franchise.franchiseName ?? '',
  });
  const heroBackdrop = getBackdropForTitle({
    localTitle: firstLocal?.localTitle,
    franchiseBackdropUrl: hub?.franchise.bannerUrl,
    catalog: heroPoster.url ? { catalogId: hub?.franchise.franchiseId ?? '', posterUrl: heroPoster.url } : undefined,
  });
  const heroBackdropUrl = heroBackdrop.url ?? heroPoster.url;

  if (!hub) {
    return (
      <section className="franchise-hub">
        <LibraryContextNav onBack={props.onBack} />
        <p className="muted">{t('media.franchise.notFound')}</p>
      </section>
    );
  }

  const handlePlay = (titleId: string) => {
    const local = props.libraryTitles.find((title) => title.id === titleId);
    const target = local ? resolveTitlePlayTarget(local) : undefined;
    if (target) props.onPlayTitle?.(titleId);
    else props.onOpenLocalTitle?.(titleId);
  };

  const localEntries = hub.titles.filter((entry) => entry.inLibrary && entry.localTitleId);
  const hasFranchiseProgress = localEntries.some((entry) =>
    entry.localTitle && getTitleProgressSummary(entry.localTitle).hasProgress
  );
  const typeSummary = formatFranchiseTypeSummary(hub.franchise.titles.map((title) => title.type));
  const startLabel = resolveFranchiseStartLabel(Boolean(firstLocal), hasFranchiseProgress, t);

  const handleStartFranchise = () => {
    if (!firstLocal?.localTitleId) return;
    handlePlay(firstLocal.localTitleId);
  };

  const handleFindMissing = () => {
    const missing = hub.titles.find((entry) => !entry.inLibrary);
    if (missing) {
      props.onOpenCatalogTitle?.(missing.catalogTitle.catalogTitleId, props.franchiseId);
    }
  };

  const handleRefreshMetadata = () => {
    for (const entry of hub.titles) {
      if (entry.localTitle) void refreshTitleMetadata(entry.localTitle);
    }
  };

  const showFallbackWarning = orderMode !== 'release' && orderModeUsesFallback(orderMode, hub.titles);
  const navigateLibrary = props.onNavigateLibrary ?? props.onBack;

  return (
    <section className="franchise-hub franchise-hub--polished">
      <LibraryContextNav
        onBack={props.onBack}
        breadcrumbs={[
          { label: t('media.library.breadcrumbLibrary'), onClick: navigateLibrary },
          { label: hub.franchise.franchiseName },
        ]}
      />

      <header className="franchise-hub-hero">
        <div className="franchise-hub-hero__banner" aria-hidden>
          {heroBackdropUrl ? (
            <img src={heroBackdropUrl} alt="" className="franchise-hub-hero__banner-img" />
          ) : (
            <div className="franchise-hub-hero__banner-fallback franchise-hub-hero__banner-fallback--generated" />
          )}
          <div className="franchise-hub-hero__banner-scrim" />
        </div>
        <div className="franchise-hub-hero__content">
          <div className="franchise-hub-hero__poster">
            <FranchiseTitleCover
              title={hub.franchise.franchiseName}
              mediaType="series"
              posterUrl={hub.franchise.posterUrl ?? fetchedFranchisePoster}
              artworkKey={hub.franchise.franchiseId}
              searchTitle={hub.franchise.franchiseName}
              preferCatalogArtwork
            />
          </div>
          <div className="franchise-hub-hero__copy">
            {hub.franchise.description && (
              <p className="franchise-hub-hero__description">{hub.franchise.description}</p>
            )}
            <div className="franchise-hub-hero__stats-row">
              <span className="prism-badge">
                {t('media.franchise.statsKnown', { count: hub.titles.length })}
              </span>
              <span className="prism-badge">
                {t('media.franchise.statsInLibrary', { count: hub.localCount })}
              </span>
              <span className="prism-badge">{typeSummary}</span>
            </div>
            <div className="franchise-hub-hero__actions">
              <button
                type="button"
                className="primary-action primary-action--shimmer franchise-hub-hero__start"
                disabled={!firstLocal}
                title={!firstLocal ? t('media.franchise.startFranchiseHint') : undefined}
                onClick={handleStartFranchise}
              >
                {startLabel}
              </button>
              <button type="button" className="ghost-button" onClick={handleFindMissing}>
                {t('media.franchise.findMissingOnline')}
              </button>
              <button type="button" className="ghost-button" onClick={handleRefreshMetadata}>
                {t('media.franchise.refreshMetadata')}
              </button>
            </div>
          </div>
        </div>
      </header>

      <FranchiseOrderSwitcher
        value={orderMode}
        onChange={setOrderMode}
        showFallbackWarning={showFallbackWarning}
      />

      <FranchiseTitleList
        heading={t('media.franchise.timelineHeading')}
        franchiseId={props.franchiseId}
        entries={hub.titles}
        orderMode={orderMode}
        onOpenLocalTitle={props.onOpenLocalTitle}
        onOpenCatalogTitle={props.onOpenCatalogTitle}
        onPlayLocalTitle={handlePlay}
      />
    </section>
  );
});
