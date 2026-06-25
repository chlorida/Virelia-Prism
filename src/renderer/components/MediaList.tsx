import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, MediaItem, Playlist, SortMode } from '../../shared/types';
import { useI18n } from '../i18n/I18nProvider';
import { usePlayback, usePlaybackSelector } from '../playback/usePlayback';
import { LibraryPageHeader } from './library/LibraryPageHeader';
import { GlassDropdown } from './GlassDropdown';
import { UiSoundToggle } from './UiSoundToggle';
import {
  buildLibraryTitles,
  filterLibraryTitles,
  findLibraryTitleById,
  findLibraryTitleByMediaId,
} from '../lib/mediaIntelligence/libraryTitleService';
import { resolveTitlePlayTarget } from '../lib/mediaIntelligence/titlePlaybackService';
import { readStored, STORAGE_KEYS, writeStored } from '../lib/storageKeys';
import { useMediaDisplayLanguage } from '../hooks/useMediaDisplayLanguage';
import { useStore } from '../lib/useStore';
import {
  libraryStore,
  setLibraryFocusedRowId,
} from '../features/library/libraryStore';
import { isLibraryBootReady } from '../features/library/libraryBootState';
import {
  libraryRouterStore,
  navigateToFranchise,
  navigateToLibraryHome,
  navigateToLocalTitle,
  navigatePrismBack,
} from '../features/library/libraryRouterStore';
import { routeToLibraryPage } from '../features/library/libraryRouterTypes';
import { LibraryRouter } from '../features/library/LibraryRouter';
import { librarySecondaryFromRoute } from '../features/library/libraryWorkspaceNavActions';
import { GlobalSearchOverlay } from './library/GlobalSearchOverlay';
import {
  closeSearchOverlay,
  isSearchOverlayOpen,
  openSearchOverlay,
  searchOverlayStore,
  setGlobalSearchQuery,
} from '../features/library/searchOverlayStore';
import { getGatewayAvailability, pingMetadataGateway } from '../lib/metadata/prismMetadataGatewayProvider';
import { anilistCatalogProvider } from '../lib/metadata/providers/anilistCatalogProvider';
import { VideoPlayerSurface } from './player/VideoPlayerSurface';
import { listFranchises } from '../lib/mediaIntelligence/franchise/franchiseService';
import { getFranchiseCatalogEntry } from '../lib/mediaIntelligence/franchise/franchiseCatalog';
import { getCatalogTitleByIdFromAnySource } from '../lib/metadata/catalogService';
import { prefetchTitleMetadataBatch } from '../lib/mediaIntelligence/metadata/titleMetadataService';
import { playUiSound } from '../services/uiAudioService';
import { contentModeStore } from '../features/content/contentModeStore';
import {
  filterMediaByContentMode,
  filterShelfLibraryTitles,
} from '../lib/mediaIntelligence/libraryTitleFilters';

export type LibraryViewMode = 'files' | 'titles';

interface MediaListProps {
  /** Library Mode: hide large video/audio preview blocks. */
  libraryMode?: boolean;
  onOpenPlayer?: () => void;
  playerMode?: import('../features/ui/playerModeTypes').PlayerMode;
  items: MediaItem[];
  durationById: Record<string, number>;
  totalMatches: number;
  listCapped: boolean;
  selectedId?: string;
  playingId?: string;
  listScopeKey?: string;
  focusedId?: string;
  query: string;
  loading?: boolean;
  libraryScanning?: boolean;
  heroVisible: boolean;
  playError?: string;
  playlists: Playlist[];
  sort?: SortMode;
  onSortChange?: (sort: SortMode) => void;
  onOpenSettings?: () => void;
  settings?: AppSettings;
  layoutVersion?: string;
  miniPlayerMode?: boolean;
  showQueueToggle?: boolean;
  showSidebarToggle?: boolean;
  queueDrawerOpen?: boolean;
  sidebarDrawerOpen?: boolean;
  onToggleQueue?: () => void;
  onToggleSidebar?: () => void;
  onDismissHero: () => void;
  onQueryChange: (query: string) => void;
  onImportFolder: () => void;
  onPlay: (item: MediaItem) => void;
  onQueue: (item: MediaItem) => void;
  onFavorite: (item: MediaItem) => void;
  onAddToPlaylist: (playlistId: string, item: MediaItem) => void;
  onFocusRow: (id: string | undefined) => void;
}

export const MediaList = memo(function MediaList(props: MediaListProps) {
  const { t } = useI18n();
  const mediaLang = useMediaDisplayLanguage();
  const [viewMode, setViewMode] = useState<LibraryViewMode>(() =>
    readStored<LibraryViewMode>(STORAGE_KEYS.libraryViewMode, 'titles')
  );
  const { actions } = usePlayback();
  const isVideo = usePlaybackSelector((s) => s.isVideo);
  const previewCollapsed = usePlaybackSelector((s) => s.isPreviewCollapsed);
  const playError = usePlaybackSelector((s) => s.error);
  const currentTrackId = usePlaybackSelector((s) => s.currentTrack?.id);

  useEffect(() => {
    if (!isVideo) actions.setPreviewCollapsed(false);
  }, [isVideo, actions]);

  useEffect(() => {
    if (!isVideo || props.libraryMode) return;
    if (window.innerHeight < 720) actions.setPreviewCollapsed(true);
  }, [isVideo, currentTrackId, actions, props.libraryMode]);

  const selectedTitleId = useStore(libraryStore, (state) => state.selectedTitleId);
  const selectedFranchiseId = useStore(libraryStore, (state) => state.selectedFranchiseId);
  const fullMedia = useStore(libraryStore, (state) => state.media);
  const libraryBoot = useStore(libraryStore, (state) => state.boot);
  const libraryLoading = useStore(libraryStore, (state) => state.loading);
  const contentMode = useStore(contentModeStore, (state) => state.mode);
  const route = useStore(libraryRouterStore, (state) => state.route);
  const searchOverlayOpen = useStore(searchOverlayStore, (state) => state.open);
  const globalSearchQuery = useStore(searchOverlayStore, (state) => state.query);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [gatewayAvailability, setGatewayAvailability] = useState(getGatewayAvailability);

  useEffect(() => {
    void pingMetadataGateway().finally(() => setGatewayAvailability(getGatewayAvailability()));
  }, []);

  const pageQuery = searchOverlayOpen ? '' : props.query;
  const displaySearchQuery = searchOverlayOpen ? globalSearchQuery : props.query;

  const allLibraryTitles = useMemo(
    () => (props.libraryMode && viewMode === 'titles' ? buildLibraryTitles(fullMedia, mediaLang) : []),
    [fullMedia, props.libraryMode, viewMode, mediaLang]
  );

  const libraryTitles = useMemo(
    () => filterShelfLibraryTitles(allLibraryTitles, contentMode),
    [allLibraryTitles, contentMode]
  );

  const listItems = useMemo(() => {
    if (!props.libraryMode || viewMode !== 'files') return props.items;
    return filterMediaByContentMode(props.items, contentMode);
  }, [props.items, props.libraryMode, viewMode, contentMode]);

  const visibleTitles = useMemo(
    () => filterLibraryTitles(libraryTitles, pageQuery),
    [libraryTitles, pageQuery]
  );

  useEffect(() => {
    if (!props.libraryMode || viewMode !== 'titles' || visibleTitles.length === 0) return;
    if (libraryLoading || !isLibraryBootReady(libraryBoot)) return;
    const run = () => {
      void prefetchTitleMetadataBatch(visibleTitles, 'normal', 8);
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 8000 });
    } else {
      globalThis.setTimeout(run, 500);
    }
  }, [props.libraryMode, viewMode, visibleTitles, libraryBoot, libraryLoading]);

  useEffect(() => {
    if (!props.libraryMode) return;
    const fromRoute = librarySecondaryFromRoute(route);
    setViewMode((current) => (current === fromRoute ? current : fromRoute));
  }, [props.libraryMode, route.page]);

  const sortOptions = useMemo(() => ([
    { value: 'recent' as const, label: t('library.sort.recent') },
    { value: 'alphabetical' as const, label: t('library.sort.alphabetical') },
    { value: 'duration' as const, label: t('library.sort.duration') },
    { value: 'folder' as const, label: t('library.sort.folder') },
  ]), [t]);

  const handleQueryChange = useCallback((query: string) => {
    if (!props.libraryMode || viewMode !== 'titles') {
      props.onQueryChange(query);
      return;
    }
    const trimmed = query.trim();
    if (trimmed || searchOverlayOpen) {
      if (!searchOverlayOpen) openSearchOverlay();
      setGlobalSearchQuery(query);
    } else {
      closeSearchOverlay();
    }
  }, [props, viewMode, searchOverlayOpen]);

  const handleSearchFocus = useCallback(() => {
    if (!props.libraryMode || viewMode !== 'titles') return;
    openSearchOverlay(displaySearchQuery);
    if (!displaySearchQuery.trim()) {
      searchInputRef.current?.select();
    }
  }, [props.libraryMode, viewMode, displaySearchQuery]);

  const handleSearchOverlayClose = useCallback(() => {
    searchInputRef.current?.blur();
  }, []);

  const selectedTitle = useMemo(
    () => findLibraryTitleById(libraryTitles, selectedTitleId),
    [libraryTitles, selectedTitleId]
  );

  const prevPlayingIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!props.libraryMode || viewMode !== 'titles' || !props.playingId) return;
    if (prevPlayingIdRef.current === props.playingId) return;
    prevPlayingIdRef.current = props.playingId;
    const playingTitle = findLibraryTitleByMediaId(libraryTitles, props.playingId);
    if (playingTitle) navigateToLocalTitle(playingTitle.id);
  }, [props.libraryMode, viewMode, props.playingId, libraryTitles]);

  const playTitle = (title: typeof selectedTitle, episodeItemId?: string) => {
    if (!title) return;
    const target = resolveTitlePlayTarget(title, episodeItemId);
    if (!target) return;
    props.onPlay(target.item);
  };

  const listHint = (() => {
    if (props.loading || props.items.length === 0 || props.totalMatches === 0) return undefined;
    if (props.libraryMode && viewMode === 'titles') {
      return t('media.list.titles', { count: visibleTitles.length.toLocaleString() });
    }
    if (!props.listCapped && props.totalMatches === props.items.length) {
      return t('media.list.files', { count: props.totalMatches.toLocaleString() });
    }
    if (props.totalMatches === props.items.length) {
      return t('media.list.files', { count: props.totalMatches.toLocaleString() });
    }
    const note = pageQuery.trim() ? t('media.list.searchNote') : '';
    return t('media.list.shown', {
      visible: props.items.length.toLocaleString(),
      total: props.totalMatches.toLocaleString(),
      note
    });
  })();
  const emptyKind = pageQuery.trim() ? 'search' : 'library';
  const showListHint = !props.loading && props.totalMatches > 0;
  const displayError = props.playError ?? playError ?? undefined;
  const libraryPage = routeToLibraryPage(route, {
    libraryMode: Boolean(props.libraryMode),
    viewMode,
    searchActive: false,
  });
  const libraryScroll = Boolean(props.libraryMode && viewMode === 'titles');
  const titlesBrowse = libraryPage === 'home';
  const detailView = libraryPage === 'franchise' || libraryPage === 'title' || libraryPage === 'catalog';

  const navigateLibraryHome = useCallback(() => {
    navigateToLibraryHome();
    playUiSound('back');
  }, []);

  useEffect(() => {
    if (!props.libraryMode || viewMode !== 'titles') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isSearchOverlayOpen()) {
        closeSearchOverlay();
        return;
      }
      if (navigatePrismBack()) return;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props.libraryMode, viewMode, props.onQueryChange]);

  const resolveGlobalSearchPlaceholder = (): string => {
    if (selectedFranchiseId) return t('media.search.placeholderFranchise');
    if (selectedTitle) return t('media.search.placeholderLibrary');
    if (gatewayAvailability === 'available') return t('search.placeholder');
    if (gatewayAvailability === 'degraded' && anilistCatalogProvider.isConfigured()) {
      return t('search.placeholderAnimeAndLibrary');
    }
    return t('search.placeholderLibraryOnly');
  };

  const globalSearchInput = (
    <label className={`global-search-input${selectedFranchiseId ? ' global-search-input--disabled' : ''}`}>
      <span className="sr-only">{t('media.search')}</span>
      <input
        ref={searchInputRef}
        value={displaySearchQuery}
        disabled={Boolean(selectedFranchiseId)}
        onFocus={handleSearchFocus}
        onChange={(event) => handleQueryChange(event.target.value)}
        placeholder={resolveGlobalSearchPlaceholder()}
        aria-label={resolveGlobalSearchPlaceholder()}
      />
    </label>
  );

  const folderCount = useMemo(
    () => new Set(props.items.map((item) => item.folder).filter(Boolean)).size,
    [props.items]
  );
  const franchiseCount = listFranchises().length;

  const selectedFranchise = useMemo(
    () => {
      if (route.page === 'franchise') return getFranchiseCatalogEntry(route.franchiseId);
      if (selectedFranchiseId) return getFranchiseCatalogEntry(selectedFranchiseId);
      return undefined;
    },
    [route, selectedFranchiseId]
  );

  const selectedCatalog = useMemo(() => {
    if (route.page !== 'catalog' && route.page !== 'catalog-season' && route.page !== 'catalog-episode') {
      return undefined;
    }
    return getCatalogTitleByIdFromAnySource(route.catalogTitleId) ?? undefined;
  }, [route]);

  const searchPlaceholder = (() => {
    if (selectedFranchiseId) return t('media.search.placeholderFranchise');
    if (selectedTitle) return t('media.search.placeholderLibrary');
    return t('search.placeholder');
  })();

  const homeSubtitle = contentMode === 'music'
    ? t('contentMode.musicSubtitle', {
      albums: libraryTitles.length.toLocaleString(),
      tracks: fullMedia.filter((item) => item.kind === 'audio').length.toLocaleString(),
      folders: folderCount,
    })
    : t('media.library.homeSubtitle', {
      items: props.totalMatches.toLocaleString(),
      franchises: franchiseCount,
      folders: folderCount,
    });

  const compactLibraryChrome = Boolean(
    props.libraryMode && (libraryPage === 'home' || libraryPage === 'discover' || libraryPage === 'watchlist' || libraryPage === 'downloads')
  );

  return (
    <main
      className={[
        'media-workspace',
        !props.libraryMode && isVideo ? 'media-workspace--video' : '',
        props.libraryMode ? 'media-workspace--library-mode' : '',
        libraryScroll ? 'media-workspace--library-scroll' : '',
        titlesBrowse ? 'media-workspace--titles-browse' : '',
        compactLibraryChrome ? 'media-workspace--compact-chrome' : '',
      ].filter(Boolean).join(' ')}
    >
      {(props.libraryMode || !compactLibraryChrome) && (
      <div
        className={[
          'topbar main-header',
          props.libraryMode ? 'main-header--library' : '',
          titlesBrowse ? 'main-header--titles-browse' : '',
          detailView ? 'main-header--contextual' : '',
          compactLibraryChrome ? 'main-header--compact' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="topbar__titles">
          <LibraryPageHeader
            page={libraryPage}
            contentMode={contentMode}
            query={props.query}
            selectedTitle={selectedTitle}
            selectedFranchise={selectedFranchise}
            selectedCatalog={selectedCatalog}
            homeSubtitle={homeSubtitle}
          />
        </div>
        <div className="topbar__tools workspace-toolbar">
          <div className="workspace-toolbar__controls">
            {props.libraryMode && libraryPage === 'files' && props.onSortChange && (
              <GlassDropdown
                value={props.sort ?? 'alphabetical'}
                options={sortOptions}
                ariaLabel={t('library.sort')}
                preferOpenUp={false}
                className="library-sort-dropdown library-sort-dropdown--toolbar"
                triggerClassName="glass-dropdown__trigger"
                onChange={props.onSortChange}
              />
            )}
            {props.libraryMode && (
              <>
                <UiSoundToggle variant="toolbar" />
                <button
                  type="button"
                  className="ghost-button"
                  onClick={props.onOpenSettings}
                >
                  {t('library.settings')}
                </button>
              </>
            )}
            {props.showSidebarToggle && (
              <button
                type="button"
                className={props.sidebarDrawerOpen ? 'ghost-button layout-toggle is-active' : 'ghost-button layout-toggle'}
                aria-pressed={props.sidebarDrawerOpen}
                onClick={props.onToggleSidebar}
              >
                {t('layout.toggleSidebar')}
              </button>
            )}
            {props.showQueueToggle && (
              <button
                type="button"
                className={props.queueDrawerOpen ? 'ghost-button layout-toggle is-active' : 'ghost-button layout-toggle'}
                aria-pressed={props.queueDrawerOpen}
                title={props.queueDrawerOpen ? t('layout.hideRightPanel') : t('layout.showRightPanel')}
                aria-label={props.queueDrawerOpen ? t('layout.hideRightPanel') : t('layout.showRightPanel')}
                onClick={props.onToggleQueue}
              >
                {t('layout.toggleQueue')}
              </button>
            )}
            {props.libraryScanning && (
              <span className="library-scan-pill" role="status">
                {t('library.scanning')}
              </span>
            )}
          </div>
        </div>
        {props.libraryMode
          && (libraryPage === 'home' || libraryPage === 'discover' || libraryPage === 'watchlist' || libraryPage === 'downloads' || detailView) && (
          <div className="topbar__search workspace-toolbar__search">
            {globalSearchInput}
          </div>
        )}
        <div className="topbar__actions">
          {(libraryPage === 'home' || libraryPage === 'discover' || libraryPage === 'watchlist' || libraryPage === 'downloads' || detailView) && !props.libraryMode && (
            <label className={`search-box${selectedFranchiseId ? ' search-box--disabled' : ''}`}>
              <span>{t('media.search')}</span>
              <input
                ref={searchInputRef}
                value={props.query}
                disabled={Boolean(selectedFranchiseId)}
                onChange={(event) => handleQueryChange(event.target.value)}
                placeholder={searchPlaceholder}
              />
            </label>
          )}
        </div>
      </div>
      )}

      {displayError && (
        <div className="inline-error" role="alert">
          {displayError}
        </div>
      )}

      {props.heroVisible && !isVideo && libraryPage === 'home' && (
        <section className="hero-card">
          <button
            type="button"
            className="hero-card__close"
            aria-label={t('settings.close')}
            onClick={props.onDismissHero}
          >
            ×
          </button>
          <div>
            <p className="eyebrow">{t('media.hero.eyebrow')}</p>
            <h3>{t('media.hero.title')}</h3>
            <p className="hero-card__desc">{t('media.hero.desc')}</p>
          </div>
          <div className="hero-orb" />
        </section>
      )}

      {props.libraryMode ? null : (
        <div className="media-workspace__preview preview-area">
          {!props.miniPlayerMode && (
            <VideoPlayerSurface
              collapsed={previewCollapsed}
              onToggleCollapsed={() => actions.setPreviewCollapsed(!previewCollapsed)}
            />
          )}
        </div>
      )}

      <div
        className={[
          'media-workspace__list',
          'media-list-scroll',
          libraryScroll && detailView ? 'media-workspace__list--title-detail' : '',
          libraryScroll ? 'media-workspace__list--library-scroll' : '',
          titlesBrowse ? 'media-workspace__list--titles-browse' : '',
        ].filter(Boolean).join(' ')}
      >
        <LibraryRouter
          viewMode={viewMode}
          libraryMode={Boolean(props.libraryMode)}
          contentMode={contentMode}
          libraryTitles={libraryTitles}
          items={listItems}
          durationById={props.durationById}
          query={pageQuery}
          selectedTitle={selectedTitle}
          listScopeKey={props.listScopeKey}
          listHint={showListHint ? listHint : undefined}
          emptyKind={emptyKind}
          loading={props.loading}
          selectedId={props.selectedId}
          playingId={props.playingId}
          focusedId={props.focusedId}
          listCapped={props.listCapped}
          totalMatches={props.totalMatches}
          playlists={props.playlists}
          layoutVersion={props.layoutVersion}
          playerMode={props.playerMode}
          searchInputRef={searchInputRef}
          onQueryChange={handleQueryChange}
          onImportFolder={props.onImportFolder}
          onOpenPlayer={props.onOpenPlayer}
          onPlay={props.onPlay}
          onQueue={props.onQueue}
          onFavorite={props.onFavorite}
          onAddToPlaylist={props.onAddToPlaylist}
          onFocusRow={props.onFocusRow}
          playTitle={playTitle}
        />
      </div>

      {props.libraryMode && (
        <GlobalSearchOverlay
          libraryTitles={libraryTitles}
          mediaItems={fullMedia}
          searchInputRef={searchInputRef}
          onClose={handleSearchOverlayClose}
          onPlayTitle={playTitle}
          onFocusRow={props.onFocusRow}
        />
      )}
    </main>
  );
});
