import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { MediaItem } from '../../shared/types';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import { useI18n } from '../i18n/I18nProvider';
import { useAppShell } from '../app/AppShellContext';
import { TitleDetailPanel } from './TitleDetailPanel';
import { TitleDetailHero } from './titleDetail/TitleDetailHero';
import { LibraryContextNav } from './library/LibraryContextNav';
import { FranchiseTitleCover } from './franchise/FranchiseTitleCover';
import {
  getCatalogEpisodes,
  getCatalogSeasons,
  resolveLocalAvailability,
} from '../lib/metadata/catalogService';
import { fetchCatalogRelatedTitles, fetchCatalogTitleDetails } from '../lib/metadata/catalogDetailsService';
import { parseCatalogRef } from '../lib/metadata/catalogRef';
import { fetchWatchOptions } from '../lib/metadata/watchOptionsProvider';
import type { CatalogTitle, CatalogMediaType, LocalAvailability, MetadataSearchResult, WatchOption } from '../lib/metadata/types';
import { resolveTitlePlayTarget } from '../lib/mediaIntelligence/titlePlaybackService';
import { navigateToCatalogTitle } from '../features/library/libraryRouterStore';
import { requestExternalSearch } from '../services/externalSearchService';
import { addToWatchlist, isInWatchlist, removeFromWatchlist } from '../features/library/watchlistStore';
import { getBackdropForTitle, getPosterForTitle } from '../lib/metadata/imageResolver';
import { resolveDisplayTitleFromCatalog } from '../lib/displayTitleResolver';
import { playUiSound } from '../services/uiAudioService';

export type MediaDetailMode = 'local' | 'catalog';

type CatalogTab = 'episodes' | 'related' | 'watch';

function availabilityLabel(availability: LocalAvailability, t: ReturnType<typeof useI18n>['t']): string {
  switch (availability) {
    case 'in_library':
      return t('catalog.availability.inLibrary');
    case 'partial':
      return t('catalog.availability.partial');
    case 'metadata_only':
      return t('catalog.availability.metadataOnly');
    default:
      return t('catalog.availability.notInLibrary');
  }
}

function resolveCatalogKindKey(type: CatalogMediaType): 'movie' | 'series' | 'ova' | 'special' {
  if (type === 'ova' || type === 'special') return type;
  if (type === 'anime') return 'series';
  return type;
}

export const MediaDetailShell = memo(function MediaDetailShell(props: {
  mode: MediaDetailMode;
  localTitle?: LibraryTitle;
  catalogTitleId?: string;
  franchiseId?: string;
  libraryTitles: LibraryTitle[];
  durationById: Record<string, number>;
  playingId?: string;
  onBack: () => void;
  onNavigateLibrary?: () => void;
  onOpenFranchise?: (franchiseId: string) => void;
  onOpenLocalTitle?: (titleId: string) => void;
  onPlay: (item: MediaItem) => void;
  onPlayEpisode: (item: MediaItem) => void;
  onFocusEpisode: (itemId: string) => void;
}) {
  if (props.mode === 'local' && props.localTitle) {
    return (
      <TitleDetailPanel
        title={props.localTitle}
        libraryTitles={props.libraryTitles}
        durationById={props.durationById}
        playingId={props.playingId}
        onBack={props.onBack}
        onNavigateLibrary={props.onNavigateLibrary}
        onOpenFranchise={props.onOpenFranchise}
        onOpenLocalTitle={props.onOpenLocalTitle}
        onPlay={props.onPlay}
        onPlayEpisode={props.onPlayEpisode}
        onFocusEpisode={props.onFocusEpisode}
      />
    );
  }

  return (
    <CatalogMediaDetail
      catalogTitleId={props.catalogTitleId ?? ''}
      franchiseId={props.franchiseId}
      libraryTitles={props.libraryTitles}
      onBack={props.onBack}
      onNavigateLibrary={props.onNavigateLibrary}
      onOpenFranchise={props.onOpenFranchise}
      onOpenLocalTitle={props.onOpenLocalTitle}
      onPlay={props.onPlay}
    />
  );
});

const CatalogMediaDetail = memo(function CatalogMediaDetail(props: {
  catalogTitleId: string;
  franchiseId?: string;
  libraryTitles: LibraryTitle[];
  onBack: () => void;
  onNavigateLibrary?: () => void;
  onOpenFranchise?: (franchiseId: string) => void;
  onOpenLocalTitle?: (titleId: string) => void;
  onPlay: (item: MediaItem) => void;
}) {
  const { t } = useI18n();
  const shell = useAppShell();
  const [tab, setTab] = useState<CatalogTab>('episodes');
  const [catalog, setCatalog] = useState<CatalogTitle | null>(null);
  const [watchOptions, setWatchOptions] = useState<WatchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [relatedTitles, setRelatedTitles] = useState<MetadataSearchResult[]>([]);
  const [descExpanded, setDescExpanded] = useState(false);

  const local = useMemo(
    () => resolveLocalAvailability(props.catalogTitleId, props.libraryTitles),
    [props.catalogTitleId, props.libraryTitles]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const details = await fetchCatalogTitleDetails(props.catalogTitleId);
      if (cancelled) return;
      setCatalog(details);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [props.catalogTitleId]);

  useEffect(() => {
    if (!catalog) return;
    const region = shell.settings.discovery.region === 'auto' ? 'US' : shell.settings.discovery.region;
    void fetchWatchOptions(catalog.catalogId, region).then(setWatchOptions);
  }, [catalog, shell.settings.discovery.region]);

  useEffect(() => {
    if (!catalog) return;
    void fetchCatalogRelatedTitles(catalog.catalogId).then(setRelatedTitles);
  }, [catalog]);

  const seasons = useMemo(
    () => getCatalogSeasons(props.catalogTitleId, local.localTitle),
    [props.catalogTitleId, local.localTitle]
  );

  const episodes = useMemo(
    () => getCatalogEpisodes(props.catalogTitleId, selectedSeason, local.localTitle),
    [props.catalogTitleId, selectedSeason, local.localTitle]
  );

  const canPlay = local.availability === 'in_library' && local.localTitle;
  const playTarget = canPlay && local.localTitle
    ? resolveTitlePlayTarget(local.localTitle)
    : undefined;

  const handlePlay = useCallback(() => {
    if (playTarget) {
      playUiSound('play');
      props.onPlay(playTarget.item);
    }
  }, [playTarget, props]);

  const handleSearchOnline = useCallback(() => {
    void requestExternalSearch(catalog?.title ?? '', catalog?.year, shell.settings);
  }, [catalog, shell.settings]);

  const catalogRef = props.catalogTitleId;
  const inWatchlist = isInWatchlist(catalogRef);
  const { provider, providerId } = parseCatalogRef(catalogRef);

  const toggleWatchlist = () => {
    if (!catalog) return;
    if (inWatchlist) {
      removeFromWatchlist(catalogRef);
      return;
    }
    addToWatchlist({
      provider,
      providerId,
      title: catalog.title,
      originalTitle: catalog.originalTitle,
      year: catalog.year,
      type: catalog.type,
      posterUrl: catalog.posterUrl,
    });
  };

  if (loading && !catalog) {
    return (
      <section className="title-detail-panel title-detail-panel--cinema glass-inset">
        <LibraryContextNav onBack={props.onBack} />
        <p className="muted">{t('catalog.loading')}</p>
      </section>
    );
  }

  if (!catalog) {
    return (
      <section className="title-detail-panel title-detail-panel--cinema glass-inset">
        <LibraryContextNav onBack={props.onBack} />
        <p className="muted">{t('catalog.notFound')}</p>
      </section>
    );
  }

  const display = resolveDisplayTitleFromCatalog(catalog);
  const poster = getPosterForTitle({
    catalog: { catalogId: catalog.catalogId, posterUrl: catalog.posterUrl },
    localTitle: local.localTitle,
    titleLabel: catalog.title,
  });
  const backdrop = getBackdropForTitle({
    catalog: { catalogId: catalog.catalogId, backdropUrl: catalog.backdropUrl, posterUrl: catalog.posterUrl },
    localTitle: local.localTitle,
  });

  const localEpisodeCount = local.localTitle?.uniqueEpisodeCount
    ?? local.localTitle?.episodes?.length
    ?? 0;
  const totalEpisodeCount = catalog.episodeCount ?? episodes.length;
  const episodeProgressLabel = totalEpisodeCount > 0
    ? `${localEpisodeCount}/${totalEpisodeCount}`
    : undefined;

  const kindKey = resolveCatalogKindKey(catalog.type);
  const synopsis = catalog.synopsis;
  const synopsisShort = synopsis && synopsis.length > 320 && !descExpanded
    ? `${synopsis.slice(0, 319).trim()}…`
    : synopsis;

  const tabs: { id: CatalogTab; label: string }[] = [
    { id: 'episodes', label: t('catalog.tab.episodes') },
    { id: 'related', label: t('mediaDetail.catalog.tab.related') },
    { id: 'watch', label: t('mediaDetail.catalog.tab.watchOptions') },
  ];

  const franchiseId = catalog.franchiseId ?? props.franchiseId;
  const franchiseName = catalog.franchiseName;

  return (
    <section className="title-detail-panel title-detail-panel--cinema glass-inset">
      <LibraryContextNav
        onBack={props.onBack}
        breadcrumbs={[
          { label: t('media.library.breadcrumbLibrary'), onClick: props.onNavigateLibrary ?? props.onBack },
          ...(franchiseName && franchiseId && props.onOpenFranchise
            ? [{ label: franchiseName, onClick: () => props.onOpenFranchise?.(franchiseId) }]
            : []),
          { label: display.title },
        ]}
      />

      <TitleDetailHero
        heroKey={catalog.catalogId}
        title={display.title}
        subtitle={display.originalTitle && display.originalTitle !== display.title
          ? display.originalTitle
          : undefined}
        year={catalog.year}
        genres={catalog.genres ?? []}
        backdropUrl={backdrop.url}
        posterUrl={poster.url}
        rating={catalog.rating}
        episodeProgressLabel={episodeProgressLabel}
        kindLabel={t(`media.titles.kind.${kindKey}`)}
        hasHeroStats={catalog.rating != null || episodeProgressLabel != null}
        availabilityChips={(
          <span className={`catalog-availability-badge catalog-availability-badge--${local.availability}`}>
            {availabilityLabel(local.availability, t)}
          </span>
        )}
        metaLine={[catalog.year, catalog.franchiseName].filter(Boolean).join(' · ')}
        actions={(
          <>
            {canPlay && playTarget && (
              <button type="button" className="primary-action primary-action--shimmer" onClick={handlePlay}>
                {t('media.titles.startWatching')}
              </button>
            )}
            <button type="button" className="ghost-button" onClick={toggleWatchlist}>
              {inWatchlist ? t('mediaDetail.catalog.removeWatchlist') : t('mediaDetail.catalog.addWatchlist')}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                playUiSound('tab');
                setTab('watch');
              }}
            >
              {t('mediaDetail.catalog.whereToWatch')}
            </button>
            <button type="button" className="ghost-button" onClick={handleSearchOnline}>
              {t('mediaDetail.catalog.searchOnline')}
            </button>
            {local.availability === 'in_library' && local.localTitleId && props.onOpenLocalTitle && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => props.onOpenLocalTitle?.(local.localTitleId!)}
              >
                {t('mediaDetail.catalog.openInLibrary')}
              </button>
            )}
          </>
        )}
      />

      <div className="title-detail-panel__body">
        {synopsis && (
          <section className="title-detail-synopsis title-detail-synopsis--split">
            <div className="title-detail-synopsis__copy">
              <h2 className="title-detail-synopsis__heading">{t('media.titles.detail.synopsis')}</h2>
              <p className="title-detail-synopsis__text">{synopsisShort}</p>
              {synopsis.length > 320 && (
                <button
                  type="button"
                  className="ghost-button title-detail-synopsis__toggle"
                  onClick={() => setDescExpanded((open) => !open)}
                >
                  {descExpanded ? t('media.titles.showLess') : t('media.titles.showMore')}
                </button>
              )}
            </div>
          </section>
        )}

        <div className="catalog-title-tabs" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? 'catalog-title-tab is-active' : 'catalog-title-tab'}
              onClick={() => {
                if (tab !== item.id) playUiSound('tab');
                setTab(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="catalog-title-panel">
          {tab === 'episodes' && (
            <div className="catalog-episodes">
              {seasons.length > 1 && (
                <div className="catalog-season-picker">
                  {seasons.map((s) => (
                    <button
                      key={s.seasonNumber}
                      type="button"
                      className={selectedSeason === s.seasonNumber ? 'franchise-order-btn is-active' : 'franchise-order-btn'}
                      onClick={() => setSelectedSeason(s.seasonNumber)}
                    >
                      {s.title ?? `S${s.seasonNumber}`}
                    </button>
                  ))}
                </div>
              )}
              {episodes.length === 0 ? (
                <p className="muted">{t('catalog.episodesUnavailable')}</p>
              ) : (
                <ul className="catalog-episode-list">
                  {episodes.map((ep) => (
                    <li key={`${ep.seasonNumber}-${ep.episodeNumber}`} className="catalog-episode-row">
                      <span className="catalog-episode-row__num">
                        {String(ep.episodeNumber).padStart(2, '0')}
                      </span>
                      <span className="catalog-episode-row__title">{ep.title}</span>
                      {ep.localMediaId ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            const item = props.libraryTitles
                              .flatMap((lt) => lt.items)
                              .find((m) => m.id === ep.localMediaId);
                            if (item) props.onPlay(item);
                          }}
                        >
                          {t('player.play')}
                        </button>
                      ) : (
                        <span className="muted catalog-episode-row__badge">{t('catalog.metadataOnly')}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'related' && (
            <div className="catalog-related-grid">
              {relatedTitles.length === 0 ? (
                <p className="muted">{t('catalog.noRelated')}</p>
              ) : (
                relatedTitles.map((item) => (
                  <button
                    key={item.catalogId}
                    type="button"
                    className="catalog-related-card"
                    onClick={() => navigateToCatalogTitle(item.catalogId, catalog.franchiseId)}
                  >
                    <FranchiseTitleCover title={item.title} mediaType={item.type} posterUrl={item.posterUrl} />
                    <span>{item.title}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {tab === 'watch' && (
            <div className="catalog-watch-options">
              {watchOptions.length === 0 ? (
                <p className="muted">{t('catalog.noWatchOptions')}</p>
              ) : (
                <ul className="catalog-watch-list">
                  {watchOptions.map((opt) => (
                    <li key={`${opt.providerId}-${opt.type}`} className="catalog-watch-row">
                      <strong>{opt.providerName}</strong>
                      <span className="meta-chip">{opt.type}</span>
                      <span className="muted">{opt.region}</span>
                      <span className="muted">{new Date(opt.fetchedAt).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="ghost-button" onClick={handleSearchOnline}>
                {t('mediaDetail.catalog.searchOnline')}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
});
