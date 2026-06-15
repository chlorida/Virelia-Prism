import { memo, useEffect, useMemo, useState } from 'react';
import type { MediaItem } from '../../shared/types';
import type { LibraryEpisode, LibraryTitle } from '../lib/mediaIntelligence/types';
import { formatDuration } from '../lib/search';
import { formatFolderLabelForDisplay } from '../lib/pathDisplay';
import { useI18n } from '../i18n/I18nProvider';
import { usePlaybackSelector } from '../playback/usePlayback';
import {
  getTitleProgressSummary,
  resolveEpisodePlayItem,
  resolveNextEpisodePlayItem,
  resolveTitlePlayTarget,
} from '../lib/mediaIntelligence/titlePlaybackService';
import { formatTitleCountDisplay } from '../lib/mediaIntelligence/titleDisplayUtils';
import { useTitleMetadata } from '../hooks/useTitleMetadata';
import { useTitleMetadataActivity } from '../hooks/useTitleMetadataActivity';
import {
  markTitleMetadataRefreshStarted,
  refreshTitleMetadata,
  type MetadataRefreshNotice,
} from '../lib/mediaIntelligence/metadata/titleMetadataService';
import { getBestTitleArtwork, pickTitleCoverItem, shouldRequestLocalThumbnail } from '../lib/mediaIntelligence/titleArtwork';
import { useMediaThumbnail } from './watch/useMediaThumbnail';
import { MediaThumb } from './watch/MediaThumb';
import { buildFranchiseTitleContext } from '../lib/mediaIntelligence/franchise/franchiseService';
import { resolveFranchiseForLibraryTitle } from '../lib/mediaIntelligence/franchise/franchiseMatcher';
import { getFranchiseCatalogEntry } from '../lib/mediaIntelligence/franchise/franchiseCatalog';
import {
  resolveLibraryEpisodeProgress,
  resolveLocalPlayLabel,
} from '../lib/mediaIntelligence/libraryDisplayUtils';
import { TitleDetailDeepTabs, getAvailableDetailTabs, type TitleDetailTab } from './TitleDetailDeepTabs';
import { TitleDetailHero } from './titleDetail/TitleDetailHero';
import { TitleMetadataProgress } from './titleDetail/TitleMetadataProgress';
import { LibraryContextNav } from './library/LibraryContextNav';

interface TitleDetailPanelProps {
  title: LibraryTitle;
  libraryTitles: LibraryTitle[];
  durationById: Record<string, number>;
  playingId?: string;
  onBack: () => void;
  onNavigateLibrary?: () => void;
  onOpenLocalTitle?: (titleId: string) => void;
  onOpenFranchise?: (franchiseId: string) => void;
  onPlay: (item: MediaItem) => void;
  onPlayEpisode: (item: MediaItem) => void;
  onFocusEpisode: (itemId: string) => void;
}

function EpisodeRow(props: {
  episode: LibraryEpisode;
  title: LibraryTitle;
  durationById: Record<string, number>;
  playingId?: string;
  nextItemId?: string;
  selected?: boolean;
  t: ReturnType<typeof useI18n>['t'];
  onSelectEpisode: (episodeId: string, itemId: string) => void;
  onPlayEpisode: (item: MediaItem) => void;
}) {
  const { episode, title, durationById, t } = props;
  const [expanded, setExpanded] = useState(false);
  const playItem = resolveEpisodePlayItem(title, episode.id);
  if (!playItem) return null;

  const duration = durationById[playItem.id] ?? episode.durationSeconds ?? playItem.durationSeconds;
  const resumeSeconds = playItem.resumePositionSeconds ?? 0;
  const hasResume = resumeSeconds > 30;
  const progressPct = duration && duration > 0 && hasResume
    ? Math.min(100, (resumeSeconds / duration) * 100)
    : 0;
  const versionCount = episode.versions.length;
  const preferredVersion = episode.versions.find((v) => v.isPreferred) ?? episode.versions[0];
  const isPlaying = props.playingId === playItem.id;
  const isNext = !isPlaying && props.nextItemId === playItem.id;
  const qualityTags = [
    preferredVersion?.isPreferred ? t('media.titles.preferredVersion') : null,
    preferredVersion?.resolution,
    ...(preferredVersion?.technicalTags ?? []).slice(0, 1),
  ].filter(Boolean) as string[];

  const episodeLabel = episode.episodeNumber != null
    ? t('media.titles.episodeNumber', { number: String(episode.episodeNumber).padStart(2, '0') })
    : episode.displayTitle;

  const rowClass = [
    'title-detail-episode__main',
    isPlaying ? 'is-playing' : '',
    isNext ? 'is-next' : '',
    props.selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  const openEpisode = () => {
    props.onSelectEpisode(episode.id, playItem.id);
  };

  return (
    <li className={`title-detail-episode${isPlaying ? ' is-playing' : ''}${isNext ? ' is-next' : ''}${props.selected ? ' is-selected' : ''}`}>
      <div
        className={rowClass}
        role="button"
        tabIndex={0}
        aria-label={t('media.titles.episode.open', { label: episodeLabel })}
        onClick={openEpisode}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.onPlayEpisode(playItem);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            openEpisode();
            return;
          }
          if (event.key === ' ') {
            event.preventDefault();
            props.onPlayEpisode(playItem);
          }
        }}
      >
        <div className="title-detail-episode__thumb">
          <MediaThumb item={playItem} size="row" priority="low" lazy />
          {isPlaying && (
            <span className="title-detail-episode__status-badge title-detail-episode__status-badge--now">
              {t('smartPanel.nowPlaying.label')}
            </span>
          )}
          {isNext && (
            <span className="title-detail-episode__status-badge title-detail-episode__status-badge--next">
              {t('smartPanel.tab.upNext')}
            </span>
          )}
        </div>
        <div className="title-detail-episode__copy">
          <div className="title-detail-episode__headline">
            <strong className="title-detail-episode__label">{episodeLabel}</strong>
            {versionCount > 1 && (
              <span className="title-detail-episode__versions-pill" title={t('media.titles.episodeVersions', { count: versionCount })}>
                {versionCount}
              </span>
            )}
          </div>
          {episode.displayTitle && episode.episodeNumber != null && (
            <span className="title-detail-episode__subtitle">{episode.displayTitle}</span>
          )}
          <span className="title-detail-episode__meta">
            {formatDuration(duration)}
            {hasResume ? ` · ${t('media.titles.inProgress')}` : ''}
          </span>
          {qualityTags.length > 0 && (
            <span className="title-detail-episode__chips">
              {qualityTags.map((tag) => (
                <span key={tag} className="meta-chip meta-chip--compact">{tag}</span>
              ))}
            </span>
          )}
          {progressPct > 0 && (
            <div className="title-detail-episode__progress" aria-hidden>
              <span style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </div>
        <div className="title-detail-episode__actions">
          {versionCount > 1 && (
            <button
              type="button"
              className="ghost-button title-detail-episode__versions-btn"
              aria-label={t('media.titles.episode.versions', { label: episodeLabel })}
              onClick={(event) => {
                event.stopPropagation();
                props.onSelectEpisode(episode.id, playItem.id);
                setExpanded((open) => !open);
              }}
            >
              {expanded ? t('media.titles.hideVersions') : t('media.titles.showVersions')}
            </button>
          )}
          <button
            type="button"
            className="title-detail-episode__play-btn"
            aria-label={t('media.titles.episode.play', { label: episodeLabel })}
            onClick={(event) => {
              event.stopPropagation();
              props.onPlayEpisode(playItem);
            }}
          >
            {hasResume && !isPlaying ? t('media.titles.continueWatching') : t('player.play')}
          </button>
        </div>
      </div>
      {expanded && versionCount > 1 && (
        <ul className="title-detail-panel__version-list title-detail-panel__version-list--nested">
          {episode.versions.map((version) => {
            const item = title.items.find((row) => row.id === version.itemId);
            if (!item) return null;
            return (
              <li key={version.itemId}>
                <button
                  type="button"
                  className="title-detail-panel__version-row"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onPlayEpisode(item);
                  }}
                >
                  <span className="smart-panel__mono">{version.filename}</span>
                  {version.isPreferred && (
                    <span className="meta-chip meta-chip--compact">{t('media.titles.preferredVersion')}</span>
                  )}
                  <span className="muted">{formatDuration(durationById[item.id] ?? item.durationSeconds)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export const TitleDetailPanel = memo(function TitleDetailPanel(props: TitleDetailPanelProps) {
  const { t } = useI18n();
  const { title } = props;
  const sessionPlayingId = usePlaybackSelector((s) => s.currentTrack?.id);
  const playingId = props.playingId ?? sessionPlayingId;
  const coverItem = useMemo(() => pickTitleCoverItem(title), [title]);
  const heroItem = coverItem ?? title.items[0];
  const progress = getTitleProgressSummary(title);
  const playTarget = resolveTitlePlayTarget(title);
  const counts = formatTitleCountDisplay(title, t, formatDuration);
  const displayEpisodes = title.episodes ?? [];
  const isSeries = title.mediaType === 'series' && displayEpisodes.length > 0;
  const kindKey = title.mediaType === 'unknown' ? 'group' : title.mediaType;
  const metaRecord = useTitleMetadata(title, 'critical');
  const metadataActivity = useTitleMetadataActivity(title);
  const enableLocalThumb = shouldRequestLocalThumbnail(metaRecord);
  const { url: thumbUrl } = useMediaThumbnail(heroItem, {
    priority: 'high',
    variant: 'large',
    lazy: false,
    enabled: enableLocalThumb,
  });
  const artwork = getBestTitleArtwork(title, metaRecord, thumbUrl, 'backdrop');
  const posterArt = getBestTitleArtwork(title, metaRecord, thumbUrl, 'poster');
  const usingLocalPoster = !posterArt.posterUrl && !metaRecord?.posterDisplayUrl && Boolean(thumbUrl);
  const backdropUrl = artwork.backdropUrl
    ?? posterArt.posterUrl
    ?? (usingLocalPoster ? undefined : (artwork.url ?? posterArt.url));
  const posterUrl = posterArt.posterUrl ?? posterArt.url ?? thumbUrl;
  const [descExpanded, setDescExpanded] = useState(false);
  const [refreshingMeta, setRefreshingMeta] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<MetadataRefreshNotice | null>(null);
  const metadataBusy = refreshingMeta || metadataActivity !== 'idle';
  const [localFramesEpoch, setLocalFramesEpoch] = useState(0);
  const [activeTab, setActiveTab] = useState<TitleDetailTab>(isSeries ? 'episodes' : 'media');
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | undefined>(() => {
    const continueId = progress.continueItem?.id;
    if (continueId) {
      const match = displayEpisodes.find((ep) =>
        ep.versions.some((v) => v.itemId === continueId)
      );
      if (match) return match.id;
    }
    return displayEpisodes[0]?.id;
  });

  const heroDuration = heroItem
    ? props.durationById[heroItem.id] ?? heroItem.durationSeconds
    : undefined;
  const folderLabel = heroItem ? formatFolderLabelForDisplay(heroItem.folder) : '';
  const versionChips = [
    ...(title.versionTags ?? []),
    ...(title.technicalTags ?? []).slice(0, 3),
  ].slice(0, 4);

  const nextItemId = useMemo(
    () => resolveNextEpisodePlayItem(title, playingId)?.id,
    [title, playingId]
  );

  const enriched = metaRecord?.metadata;

  const franchiseContext = useMemo(
    () => buildFranchiseTitleContext(title, props.libraryTitles),
    [title, props.libraryTitles]
  );
  const franchiseId = title.franchiseId ?? franchiseContext?.franchise.franchiseId
    ?? resolveFranchiseForLibraryTitle(title)?.franchiseId;
  const heroTitle = enriched?.localizedTitle ?? enriched?.canonicalTitle ?? title.displayTitle;

  useEffect(() => {
    const tabs = getAvailableDetailTabs(title, isSeries, props.libraryTitles, enriched, metaRecord);
    if (!tabs.includes(activeTab)) {
      setActiveTab(tabs[0] ?? 'details');
    }
  }, [title, isSeries, props.libraryTitles, enriched, metaRecord, activeTab]);
  const heroYear = enriched?.year ?? title.year;
  const synopsis = enriched?.description;
  const synopsisShort = synopsis && synopsis.length > 320 && !descExpanded
    ? `${synopsis.slice(0, 319).trim()}…`
    : synopsis;

  const franchiseName = franchiseContext?.franchise.franchiseName
    ?? (franchiseId ? getFranchiseCatalogEntry(franchiseId)?.franchiseName : undefined);
  const episodeProgress = resolveLibraryEpisodeProgress(title, enriched);
  const heroRating = enriched?.rating;
  const hasHeroStats = heroRating != null || episodeProgress != null;
  const hasCatalogEpisodeTotal = (enriched?.episodeCount ?? 0) > 0;
  const primaryPlayLabel = resolveLocalPlayLabel(title, t);

  return (
    <section className="title-detail-panel title-detail-panel--cinema glass-inset">
      <LibraryContextNav
        onBack={props.onBack}
        breadcrumbs={[
          { label: t('media.library.breadcrumbLibrary'), onClick: props.onNavigateLibrary ?? props.onBack },
          ...(franchiseName && franchiseId && props.onOpenFranchise
            ? [{ label: franchiseName, onClick: () => props.onOpenFranchise?.(franchiseId) }]
            : []),
          { label: heroTitle },
        ]}
      />
      <TitleDetailHero
        heroKey={title.id}
        title={heroTitle}
        subtitle={enriched?.originalTitle && enriched.originalTitle !== heroTitle
          ? enriched.originalTitle
          : undefined}
        year={heroYear}
        genres={enriched?.genres ?? []}
        backdropUrl={backdropUrl}
        posterUrl={posterUrl}
        posterUsesLocalStyle={usingLocalPoster}
        rating={heroRating}
        episodeProgressLabel={episodeProgress
          ? `${episodeProgress.local}/${episodeProgress.total}`
          : undefined}
        kindLabel={t(`media.titles.kind.${kindKey}`)}
        availabilityChips={(
          <span className="franchise-status-badge franchise-status-badge--in">
            {t('media.library.statusInLibrary')}
          </span>
        )}
        metaLine={`${[
          hasCatalogEpisodeTotal ? null : counts.primary,
          counts.secondary,
          enriched?.format,
        ].filter(Boolean).join(' · ')}${title.duplicateVersionCount > 0 ? ` · ${t('media.titles.duplicatesDetected')}` : ''}`}
        inProgressLabel={progress.hasProgress ? t('media.titles.inProgress') : undefined}
        metadataBusy={metadataBusy}
        hasHeroStats={hasHeroStats}
        actions={(
          <>
            {progress.hasProgress && playTarget && (
              <button type="button" className="primary-action primary-action--shimmer" onClick={() => props.onPlay(playTarget.item)}>
                {t('media.titles.continueWatching')}
              </button>
            )}
            {playTarget && (
              <button
                type="button"
                className={progress.hasProgress ? 'pill-button pill-button--accent' : 'primary-action primary-action--shimmer'}
                onClick={() => props.onPlay(playTarget.item)}
              >
                {progress.hasProgress ? t('media.titles.startOver') : primaryPlayLabel}
              </button>
            )}
            <button
              type="button"
              className={metadataBusy
                ? 'ghost-button pill-button--metadata-busy'
                : 'ghost-button'}
              disabled={metadataBusy}
              onClick={() => {
                if (metadataBusy) return;
                markTitleMetadataRefreshStarted(title);
                setRefreshingMeta(true);
                setRefreshNotice(null);
                void refreshTitleMetadata(title)
                  .then((result) => {
                    setLocalFramesEpoch((epoch) => epoch + 1);
                    if (result.notice && result.notice !== 'updated') {
                      setRefreshNotice(result.notice);
                    }
                  })
                  .finally(() => setRefreshingMeta(false));
              }}
            >
              {metadataBusy && (
                <span className="pill-button__spinner" aria-hidden />
              )}
              <span>
                {metadataBusy ? t('media.titles.metadata.refreshing') : t('media.titles.refreshMetadata')}
              </span>
            </button>
            {franchiseId && props.onOpenFranchise && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => props.onOpenFranchise?.(franchiseId)}
              >
                {t('media.franchise.backToFranchise')}
              </button>
            )}
          </>
        )}
        statusFooter={(
          <>
            {metadataBusy && (
              <TitleMetadataProgress
                activity={metadataActivity === 'images' ? 'images' : 'search'}
                compact
              />
            )}
            {!metadataBusy && refreshNotice === 'offline' && (
              <p className="title-detail-meta-status title-detail-meta-status--warn">
                {t('media.titles.metadata.refreshOffline')}
              </p>
            )}
            {!metadataBusy && refreshNotice === 'failed' && (
              <p className="title-detail-meta-status title-detail-meta-status--warn">
                {t('media.titles.metadata.refreshFailed')}
              </p>
            )}
            {!metadataBusy && refreshNotice === 'restored' && (
              <p className="title-detail-meta-status muted">
                {t('media.titles.metadata.refreshKeptPrevious')}
              </p>
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

        <TitleDetailDeepTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          title={title}
          libraryTitles={props.libraryTitles}
          localFramesEpoch={localFramesEpoch}
          onOpenLocalTitle={props.onOpenLocalTitle}
          onOpenFranchise={props.onOpenFranchise}
          metaRecord={metaRecord}
          enriched={enriched}
          isSeries={isSeries}
          heroItem={heroItem}
          heroDuration={heroDuration}
          folderLabel={folderLabel}
          versionChips={versionChips}
          kindKey={kindKey}
          durationById={props.durationById}
          onPlayFile={props.onPlayEpisode}
          t={t}
        >
          {isSeries && activeTab === 'episodes' && (
            <section className="title-detail-episodes">
              <h2 className="title-detail-episodes__heading">{t('media.titles.episodeList')}</h2>
              <ul className="title-detail-episodes__list">
                {displayEpisodes.map((episode) => (
                  <EpisodeRow
                    key={episode.id}
                    episode={episode}
                    title={title}
                    durationById={props.durationById}
                    playingId={playingId}
                    nextItemId={nextItemId}
                    selected={selectedEpisodeId === episode.id}
                    t={t}
                    onSelectEpisode={(episodeId, itemId) => {
                      setSelectedEpisodeId(episodeId);
                      props.onFocusEpisode(itemId);
                    }}
                    onPlayEpisode={props.onPlayEpisode}
                  />
                ))}
              </ul>
            </section>
          )}
        </TitleDetailDeepTabs>
      </div>
    </section>
  );
});
