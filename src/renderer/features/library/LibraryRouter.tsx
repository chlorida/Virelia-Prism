import { memo, useEffect, useMemo } from 'react';
import type { MediaItem } from '../../../shared/types';
import type { LibraryTitle } from '../../lib/mediaIntelligence/types';
import { useStore } from '../../lib/useStore';
import { libraryRouterStore } from './libraryRouterStore';
import { FranchiseHubPanel } from '../../components/franchise/FranchiseHubPanel';
import { MediaDetailShell } from '../../components/MediaDetailShell';
import { LibraryFranchisesRow } from '../../components/LibraryFranchisesRow';
import { TitleMediaGrid } from '../../components/TitleMediaGrid';
import { VirtualMediaTable } from '../../components/VirtualMediaTable';
import { MediaDiscoveryCard } from '../../components/library/MediaDiscoveryCard';
import { DiscoverPage } from './pages/DiscoverPage';
import { WatchlistPage } from './pages/WatchlistPage';
import {
  findLibraryTitleById,
} from '../../lib/mediaIntelligence/libraryTitleService';
import { resolveTitlePlayTarget } from '../../lib/mediaIntelligence/titlePlaybackService';
import {
  navigateToCatalogTitle,
  navigateToFranchise,
  navigateToLibraryHome,
  navigateToLocalTitle,
  navigatePrismBack,
} from './libraryRouterStore';
import { setLibraryFocusedRowId } from './libraryStore';
import { playUiSound } from '../../services/uiAudioService';
import {
  resolveCardPrimaryAction,
} from '../../lib/metadata/recommendationService';
import type { Playlist } from '../../../shared/types';
import type { PrismRoute } from './libraryRouterTypes';
import { LibraryPageEnter } from './LibraryPageEnter';
import type { LibraryViewMode } from '../../components/MediaList';
import { useI18n } from '../../i18n/I18nProvider';

function resolveRouteKey(route: PrismRoute): string {
  switch (route.page) {
    case 'title':
      return `title-${route.localTitleId}`;
    case 'franchise':
      return `franchise-${route.franchiseId}`;
    case 'catalog':
    case 'catalog-season':
    case 'catalog-episode':
      return `catalog-${route.catalogTitleId}-${route.page}`;
    case 'files':
      return 'files';
    default:
      return route.page;
  }
}

interface LibraryRouterProps {
  viewMode: LibraryViewMode;
  libraryMode: boolean;
  libraryTitles: LibraryTitle[];
  items: MediaItem[];
  durationById: Record<string, number>;
  query: string;
  selectedTitle?: LibraryTitle;
  listScopeKey?: string;
  listHint?: string;
  emptyKind: 'search' | 'library';
  loading?: boolean;
  selectedId?: string;
  playingId?: string;
  focusedId?: string;
  listCapped: boolean;
  totalMatches: number;
  playlists: Playlist[];
  layoutVersion?: string;
  playerMode?: import('../ui/playerModeTypes').PlayerMode;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  onImportFolder: () => void;
  onOpenPlayer?: () => void;
  onPlay: (item: MediaItem) => void;
  onQueue: (item: MediaItem) => void;
  onFavorite: (item: MediaItem) => void;
  onAddToPlaylist: (playlistId: string, item: MediaItem) => void;
  onFocusRow: (id: string | undefined) => void;
  playTitle: (title: LibraryTitle | undefined, episodeItemId?: string) => void;
}

function titleNewestMtime(title: LibraryTitle): number {
  let max = 0;
  for (const item of title.items) {
    if (item.mtimeMs && item.mtimeMs > max) max = item.mtimeMs;
  }
  return max;
}

export const LibraryRouter = memo(function LibraryRouter(props: LibraryRouterProps) {
  const { t } = useI18n();
  const route = useStore(libraryRouterStore, (s) => s.route);
  const routeKey = resolveRouteKey(route);

  const navigateLibraryHome = () => {
    props.onQueryChange('');
    navigateToLibraryHome();
    playUiSound('back');
  };

  const recentlyAdded = useMemo(() => {
    if (props.libraryTitles.length <= 6) return [];
    return [...props.libraryTitles]
      .sort((a, b) => titleNewestMtime(b) - titleNewestMtime(a))
      .slice(0, 4);
  }, [props.libraryTitles]);

  const excludeTitleIds = useMemo(
    () => new Set(recentlyAdded.map((title) => title.id)),
    [recentlyAdded]
  );

  if (!props.libraryMode || props.viewMode === 'files') {
    return (
      <VirtualMediaTable
        items={props.items}
        durationById={props.durationById}
        selectedId={props.selectedId}
        playingId={props.playingId}
        listScopeKey={props.listScopeKey}
        layoutVersion={props.layoutVersion}
        focusedId={props.focusedId}
        listHint={props.listHint}
        emptyKind={props.emptyKind}
        loading={props.loading}
        playlists={props.playlists}
        onImportFolder={props.onImportFolder}
        onPlay={props.onPlay}
        onQueue={props.onQueue}
        onFavorite={props.onFavorite}
        onAddToPlaylist={props.onAddToPlaylist}
        onFocusRow={props.onFocusRow}
        playerMode={props.playerMode}
      />
    );
  }

  if (route.page === 'discover') {
    return (
      <LibraryPageEnter routeKey={routeKey}>
        <DiscoverPage
          libraryTitles={props.libraryTitles}
          mediaItems={props.items}
          onPlay={props.onPlay}
        />
      </LibraryPageEnter>
    );
  }

  if (route.page === 'watchlist') {
    return (
      <LibraryPageEnter routeKey={routeKey}>
        <WatchlistPage onNavigateLibrary={navigateLibraryHome} />
      </LibraryPageEnter>
    );
  }

  if (route.page === 'search') {
    return null;
  }

  if (route.page === 'catalog' || route.page === 'catalog-season' || route.page === 'catalog-episode') {
    const catalogId = route.catalogTitleId;
    return (
      <LibraryPageEnter routeKey={routeKey}>
        <MediaDetailShell
          mode="catalog"
          catalogTitleId={catalogId}
          franchiseId={route.franchiseId}
          libraryTitles={props.libraryTitles}
          durationById={props.durationById}
          playingId={props.playingId}
          onBack={() => {
            playUiSound('back');
            if (!navigatePrismBack()) navigateLibraryHome();
          }}
          onNavigateLibrary={navigateLibraryHome}
          onOpenFranchise={(franchiseId) => {
            playUiSound('open');
            navigateToFranchise(franchiseId);
          }}
          onOpenLocalTitle={(titleId) => {
            playUiSound('open');
            navigateToLocalTitle(titleId);
            const target = findLibraryTitleById(props.libraryTitles, titleId);
            const focus = target ? resolveTitlePlayTarget(target)?.item : undefined;
            if (focus) props.onFocusRow(focus.id);
          }}
          onPlay={props.onPlay}
          onPlayEpisode={props.onPlay}
          onFocusEpisode={(id) => {
            setLibraryFocusedRowId(id);
            props.onFocusRow(id);
          }}
        />
      </LibraryPageEnter>
    );
  }

  if (route.page === 'franchise') {
    return (
      <LibraryPageEnter routeKey={routeKey}>
        <FranchiseHubPanel
        franchiseId={route.franchiseId}
        libraryTitles={props.libraryTitles}
        onBack={() => {
          playUiSound('back');
          if (!navigatePrismBack()) navigateLibraryHome();
        }}
        onNavigateLibrary={navigateLibraryHome}
        onOpenLocalTitle={(titleId) => {
          playUiSound('open');
          navigateToLocalTitle(titleId);
          const target = findLibraryTitleById(props.libraryTitles, titleId);
          const focus = target ? resolveTitlePlayTarget(target)?.item : undefined;
          if (focus) props.onFocusRow(focus.id);
        }}
        onOpenCatalogTitle={(catalogTitleId, franchiseId) => {
          playUiSound('open');
          navigateToCatalogTitle(catalogTitleId, franchiseId);
        }}
        onPlayTitle={(titleId) => {
          const targetTitle = findLibraryTitleById(props.libraryTitles, titleId);
          const playTarget = targetTitle ? resolveTitlePlayTarget(targetTitle) : undefined;
          if (playTarget) props.onPlay(playTarget.item);
        }}
      />
      </LibraryPageEnter>
    );
  }

  if (route.page === 'title') {
    const title = findLibraryTitleById(props.libraryTitles, route.localTitleId);
    if (!title) {
      return <p className="muted">{t('media.library.titleNotFound')}</p>;
    }
    return (
      <LibraryPageEnter routeKey={routeKey}>
        <MediaDetailShell
          mode="local"
          localTitle={title}
          libraryTitles={props.libraryTitles}
          durationById={props.durationById}
          playingId={props.playingId}
          onBack={() => {
            playUiSound('back');
            if (!navigatePrismBack()) navigateLibraryHome();
          }}
          onNavigateLibrary={navigateLibraryHome}
          onOpenFranchise={(franchiseId) => {
            playUiSound('open');
            navigateToFranchise(franchiseId);
          }}
          onOpenLocalTitle={(titleId) => {
            navigateToLocalTitle(titleId);
            const target = findLibraryTitleById(props.libraryTitles, titleId);
            const focus = target ? resolveTitlePlayTarget(target)?.item : undefined;
            if (focus) props.onFocusRow(focus.id);
          }}
          onPlay={(item) => props.onPlay(item)}
          onPlayEpisode={(item) => props.onPlay(item)}
          onFocusEpisode={(id) => {
            setLibraryFocusedRowId(id);
            props.onFocusRow(id);
          }}
        />
      </LibraryPageEnter>
    );
  }

  return (
    <LibraryPageEnter routeKey={routeKey}>
    <>
      <LibraryFranchisesRow
        libraryTitles={props.libraryTitles}
        onOpenFranchise={(franchiseId) => {
          playUiSound('open');
          navigateToFranchise(franchiseId);
        }}
      />
      {recentlyAdded.length > 0 && (
        <section className="library-home-section">
          <h2 className="library-home-section__heading">{t('library.section.recentlyAdded')}</h2>
          <div className="discover-row">
            {recentlyAdded.map((title) => {
              const item = {
                localTitleId: title.id,
                title: title.displayTitle,
                year: title.year,
                type: (title.mediaType === 'unknown' ? 'movie' : title.mediaType) as 'movie' | 'series' | 'anime' | 'ova' | 'special',
                localAvailability: 'in_library' as const,
                reason: 'recent',
                reasonKey: 'discover.reason.recentlyAdded',
                score: 0,
              };
              const primary = resolveCardPrimaryAction(item, title, t);
              return (
                <MediaDiscoveryCard
                  key={`recent-${title.id}`}
                  item={item}
                  localTitle={title}
                  primaryLabel={primary.label}
                  showPrimaryAction={primary.playable}
                  onOpen={() => {
                    playUiSound('open');
                    navigateToLocalTitle(title.id);
                  }}
                  onPrimaryAction={() => props.playTitle(title)}
                />
              );
            })}
          </div>
        </section>
      )}
      <section className="library-home-section">
        <TitleMediaGrid
          titles={props.libraryTitles}
          excludeTitleIds={excludeTitleIds}
          selectedTitleId={undefined}
          playingId={props.playingId}
          listScopeKey={`${props.listScopeKey}-titles`}
          listHint={props.listHint}
          emptyKind={props.emptyKind}
          loading={props.loading}
          onImportFolder={props.onImportFolder}
          onOpenPlayer={props.onOpenPlayer}
          onOpenTitle={(title) => {
            playUiSound('open');
            navigateToLocalTitle(title.id);
            const focus = resolveTitlePlayTarget(title)?.item;
            if (focus) props.onFocusRow(focus.id);
          }}
          onContinueTitle={(title) => props.playTitle(title)}
        />
      </section>
    </>
    </LibraryPageEnter>
  );
});
