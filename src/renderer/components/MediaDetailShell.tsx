import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { MediaItem } from '../../shared/types';
import type { EnrichedTitleMetadata, TitleMediaAsset, TitleMediaBundle } from '../../shared/titleMetadataTypes';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import { useI18n } from '../i18n/I18nProvider';
import { useAppShell } from '../app/AppShellContext';
import { TitleDetailPanel } from './TitleDetailPanel';
import { TitleDetailHero } from './titleDetail/TitleDetailHero';
import { TitleCharactersTab } from './titleDetail/TitleCharactersTab';
import { TitleMediaGallery } from './titleDetail/TitleMediaGallery';
import { LibraryContextNav } from './library/LibraryContextNav';
import { PrismLoadingSpinner } from './PrismLoadingSpinner';
import { FranchiseTitleCover } from './franchise/FranchiseTitleCover';
import {
  getCatalogEpisodes,
  getCatalogSeasons,
  resolveLocalAvailability,
} from '../lib/metadata/catalogService';
import {
  fetchCatalogTitleBundle,
  getCachedCatalogEnriched,
  seedCatalogTitle,
} from '../lib/metadata/catalogDetailsService';
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
import { formatDuration } from '../lib/search';
import type { TranslationKey } from '../../shared/i18n';
import { useTitleLocalFrames } from '../hooks/useTitleLocalFrames';

export type MediaDetailMode = 'local' | 'catalog';

type CatalogDetailTab = 'episodes' | 'media' | 'characters' | 'explore' | 'details' | 'watch';

function isSeriesCatalog(catalog: CatalogTitle): boolean {
  return catalog.type === 'series' || catalog.type === 'anime';
}

function getAvailableCatalogTabs(
  catalog: CatalogTitle | null,
  enriched?: EnrichedTitleMetadata,
): CatalogDetailTab[] {
  const tabs: CatalogDetailTab[] = [];
  if (catalog && isSeriesCatalog(catalog)) tabs.push('episodes');
  tabs.push('media');
  if ((enriched?.characters?.length ?? 0) > 0) tabs.push('characters');
  tabs.push('explore', 'watch', 'details');
  return tabs;
}

function defaultCatalogTab(
  catalog: CatalogTitle | null,
  availability?: LocalAvailability
): CatalogDetailTab {
  if (catalog && isSeriesCatalog(catalog)) {
    if (catalog.source === 'franchise-catalog' && availability !== 'in_library') {
      return 'media';
    }
    return 'episodes';
  }
  return 'media';
}

function buildCatalogMediaBundle(
  catalog: CatalogTitle,
  enriched?: EnrichedTitleMetadata,
  episodes?: Array<{ stillUrl?: string; title: string }>,
  localFrames?: TitleMediaAsset[],
): TitleMediaBundle | undefined {
  const episodeStills = (episodes ?? [])
    .filter((episode) => episode.stillUrl)
    .map((episode, index) => ({
      id: `still-${index}`,
      kind: 'screenshot' as const,
      url: episode.stillUrl!,
      label: episode.title,
      source: 'cache' as const,
    }));

  const frameShots = dedupeCatalogFrames(localFrames ?? []);
  const onlineScreenshots = dedupeCatalogFrames([
    ...(enriched?.media?.screenshots ?? []),
    ...episodeStills,
  ]);

  if (enriched?.media) {
    return {
      ...enriched.media,
      screenshots: onlineScreenshots.length > 0 ? onlineScreenshots : enriched.media.screenshots,
      localFrames: frameShots.length > 0 ? frameShots : enriched.media.localFrames,
      backdrops: enriched.media.backdrops ?? enriched.media.banners,
    };
  }

  if (frameShots.length === 0 && onlineScreenshots.length === 0 && !enriched?.trailerUrl) return undefined;
  return {
    screenshots: onlineScreenshots.length > 0 ? onlineScreenshots : undefined,
    localFrames: frameShots.length > 0 ? frameShots : undefined,
  };
}

function dedupeCatalogFrames(assets: TitleMediaAsset[]): TitleMediaAsset[] {
  const seen = new Set<string>();
  const out: TitleMediaAsset[] = [];
  for (const asset of assets) {
    const key = asset.displayUrl ?? asset.url ?? asset.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset);
  }
  return out;
}

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
  const catalogRef = props.catalogTitleId;
  const [tab, setTab] = useState<CatalogDetailTab>(() => defaultCatalogTab(
    seedCatalogTitle(catalogRef),
    resolveLocalAvailability(catalogRef, props.libraryTitles).availability
  ));
  const [catalog, setCatalog] = useState<CatalogTitle | null>(() => seedCatalogTitle(catalogRef));
  const [enriched, setEnriched] = useState<EnrichedTitleMetadata | undefined>(
    () => getCachedCatalogEnriched(catalogRef),
  );
  const [relatedTitles, setRelatedTitles] = useState<MetadataSearchResult[]>([]);
  const [watchOptions, setWatchOptions] = useState<WatchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [descExpanded, setDescExpanded] = useState(false);

  const local = useMemo(
    () => resolveLocalAvailability(props.catalogTitleId, props.libraryTitles),
    [props.catalogTitleId, props.libraryTitles]
  );
  const { frames: localFrames } = useTitleLocalFrames(local.localTitle);

  useEffect(() => {
    let cancelled = false;
    const seed = seedCatalogTitle(catalogRef);
    const cachedEnriched = getCachedCatalogEnriched(catalogRef);
    setCatalog(seed);
    setEnriched(cachedEnriched);
    setTab(defaultCatalogTab(seed, resolveLocalAvailability(catalogRef, props.libraryTitles).availability));
    setLoading(true);

    void (async () => {
      const bundle = await fetchCatalogTitleBundle(catalogRef);
      if (cancelled) return;
      setCatalog(bundle.catalog);
      setEnriched(bundle.enriched ?? getCachedCatalogEnriched(catalogRef));
      setRelatedTitles(bundle.related);
      setLoading(false);
      if (bundle.catalog) {
        setTab((current) => {
          const available = getAvailableCatalogTabs(bundle.catalog, bundle.enriched);
          return available.includes(current) ? current : defaultCatalogTab(
            bundle.catalog,
            local.availability
          );
        });
      }
    })();

    return () => { cancelled = true; };
  }, [catalogRef]);

  useEffect(() => {
    if (!catalog) return;
    const region = shell.settings.discovery.region === 'auto' ? 'US' : shell.settings.discovery.region;
    void fetchWatchOptions(catalog.catalogId, region).then(setWatchOptions);
  }, [catalog, shell.settings.discovery.region]);

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

  const catalogRefKey = props.catalogTitleId;
  const inWatchlist = isInWatchlist(catalogRefKey);
  const { provider, providerId } = parseCatalogRef(catalogRefKey);

  const toggleWatchlist = () => {
    if (!catalog) return;
    if (inWatchlist) {
      removeFromWatchlist(catalogRefKey);
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

  const catalogTabLabel = (detailTab: CatalogDetailTab): string => {
    if (detailTab === 'watch') return t('mediaDetail.catalog.tab.watchOptions');
    return t(`media.titles.tab.${detailTab}` as TranslationKey);
  };

  if (!catalog && !loading) {
    return (
      <section className="title-detail-panel title-detail-panel--cinema glass-inset">
        <LibraryContextNav onBack={props.onBack} />
        <p className="muted">{t('catalog.notFound')}</p>
      </section>
    );
  }

  const display = catalog ? resolveDisplayTitleFromCatalog(catalog) : { title: t('catalog.loading') };
  const poster = catalog ? getPosterForTitle({
    catalog: {
      catalogId: catalog.catalogId,
      posterUrl: catalog.posterUrl ?? enriched?.posterUrl,
    },
    localTitle: local.localTitle,
    titleLabel: catalog.title,
  }) : { url: undefined };
  const backdrop = catalog ? getBackdropForTitle({
    catalog: {
      catalogId: catalog.catalogId,
      backdropUrl: catalog.backdropUrl ?? enriched?.backdropUrl ?? enriched?.bannerUrl,
      posterUrl: catalog.posterUrl ?? enriched?.posterUrl,
    },
    localTitle: local.localTitle,
  }) : { url: undefined };

  const localEpisodeCount = local.localTitle?.uniqueEpisodeCount
    ?? local.localTitle?.episodes?.length
    ?? 0;
  const totalEpisodeCount = catalog?.episodeCount ?? episodes.length;
  const episodeProgressLabel = catalog && totalEpisodeCount > 0
    ? `${localEpisodeCount}/${totalEpisodeCount}`
    : undefined;

  const kindKey = catalog ? resolveCatalogKindKey(catalog.type) : 'series';
  const synopsis = catalog?.synopsis;
  const synopsisShort = synopsis && synopsis.length > 320 && !descExpanded
    ? `${synopsis.slice(0, 319).trim()}…`
    : synopsis;

  const availableTabs = getAvailableCatalogTabs(catalog, enriched);
  const primaryTabs = availableTabs.filter((item) => item !== 'details');
  const mediaBundle = catalog
    ? buildCatalogMediaBundle(catalog, enriched, episodes, localFrames)
    : undefined;
  const franchiseId = catalog?.franchiseId ?? props.franchiseId;
  const franchiseName = catalog?.franchiseName;

  const renderTabPanel = () => {
    if (!catalog && loading) {
      return <PrismLoadingSpinner label={t('catalog.loading')} />;
    }

    if (!catalog) {
      return <p className="muted">{t('catalog.notFound')}</p>;
    }

    if (tab === 'episodes') {
      return (
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
      );
    }

    if (tab === 'media') {
      return mediaBundle ? (
        <TitleMediaGallery
          media={mediaBundle}
          trailerUrl={enriched?.trailerUrl ?? enriched?.media?.trailer?.url}
          trailerThumbnailUrl={enriched?.trailerThumbnailUrl ?? enriched?.media?.trailer?.thumbnailUrl}
        />
      ) : (
        <div className="media-empty-state">
          <p>{t('media.titles.media.emptyTitle')}</p>
          <small>{t('media.titles.media.emptyHint')}</small>
        </div>
      );
    }

    if (tab === 'characters') {
      return <TitleCharactersTab characters={enriched?.characters} />;
    }

    if (tab === 'explore') {
      return (
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
      );
    }

    if (tab === 'watch') {
      return (
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
      );
    }

    return (
      <section className="title-detail-deep title-detail-deep--details">
        <dl className="title-detail-info__grid">
          <div><dt>{t('media.titles.detail.type')}</dt><dd>{t(`media.titles.kind.${kindKey}` as TranslationKey)}</dd></div>
          {catalog.year != null && (
            <div><dt>{t('media.titles.detail.year')}</dt><dd>{catalog.year}</dd></div>
          )}
          {isSeriesCatalog(catalog) && catalog.episodeCount != null && (
            <div><dt>{t('media.titles.detail.episodes')}</dt><dd>{catalog.episodeCount}</dd></div>
          )}
          {catalog.rating != null && (
            <div><dt>{t('media.titles.detail.ratingLabel')}</dt><dd>{catalog.rating.toFixed(1)}</dd></div>
          )}
          {enriched?.status && (
            <div><dt>{t('media.titles.detail.status')}</dt><dd>{enriched.status}</dd></div>
          )}
          {(catalog.studios?.length ?? 0) > 0 && (
            <div><dt>{t('media.titles.detail.studio')}</dt><dd>{catalog.studios.join(', ')}</dd></div>
          )}
          {enriched?.source && (
            <div><dt>{t('media.titles.detail.adaptationSource')}</dt><dd>{enriched.source}</dd></div>
          )}
          {(catalog.countries?.length ?? 0) > 0 && (
            <div><dt>{t('media.titles.detail.country')}</dt><dd>{catalog.countries.join(', ')}</dd></div>
          )}
          {enriched?.duration != null && (
            <div><dt>{t('media.titles.detail.episodeDuration')}</dt><dd>{formatDuration(enriched.duration * 60)}</dd></div>
          )}
          {!isSeriesCatalog(catalog) && catalog.runtimeMinutes != null && (
            <div><dt>{t('media.titles.detail.duration')}</dt><dd>{formatDuration(catalog.runtimeMinutes * 60)}</dd></div>
          )}
          {(catalog.genres?.length ?? 0) > 0 && (
            <div className="title-detail-deep__tags">
              <dt>{t('media.titles.detail.tags')}</dt>
              <dd>
                <div className="title-detail-info__chips">
                  {catalog.genres.slice(0, 8).map((tag) => (
                    <span key={tag} className="meta-chip meta-chip--compact">{tag}</span>
                  ))}
                </div>
              </dd>
            </div>
          )}
        </dl>
        {catalog.sourceUrl && (
          <p className="title-detail-deep__external">
            <a href={catalog.sourceUrl} target="_blank" rel="noreferrer noopener">
              {t('media.titles.detail.externalLink')}
            </a>
          </p>
        )}
      </section>
    );
  };

  return (
    <section className={`title-detail-panel title-detail-panel--cinema glass-inset${loading && !catalog ? ' title-detail-panel--loading' : ''}`}>
      <LibraryContextNav
        onBack={props.onBack}
        breadcrumbs={catalog ? [
          { label: t('media.library.breadcrumbLibrary'), onClick: props.onNavigateLibrary ?? props.onBack },
          ...(franchiseName && franchiseId && props.onOpenFranchise
            ? [{ label: franchiseName, onClick: () => props.onOpenFranchise?.(franchiseId) }]
            : []),
          { label: display.title },
        ] : undefined}
      />

      {catalog ? (
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
      ) : (
        <PrismLoadingSpinner label={t('catalog.loading')} />
      )}

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

        <div className="title-detail-tabs" role="tablist" aria-label={t('media.titles.detail.sections')}>
          <div className="title-detail-tabs__primary">
            {primaryTabs.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                className={tab === item ? 'title-detail-tabs__tab is-active' : 'title-detail-tabs__tab'}
                onClick={() => {
                  if (tab !== item) playUiSound('tab');
                  setTab(item);
                }}
              >
                {catalogTabLabel(item)}
              </button>
            ))}
          </div>
          {availableTabs.includes('details') && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'details'}
              className={tab === 'details'
                ? 'title-detail-tabs__tab title-detail-tabs__tab--details is-active'
                : 'title-detail-tabs__tab title-detail-tabs__tab--details'}
              onClick={() => {
                if (tab !== 'details') playUiSound('tab');
                setTab('details');
              }}
            >
              {catalogTabLabel('details')}
            </button>
          )}
        </div>

        <div key={tab} className="catalog-title-panel prism-tab-content-enter">
          {renderTabPanel()}
        </div>
      </div>
    </section>
  );
});
