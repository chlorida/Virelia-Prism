import { memo } from 'react';
import { MediaList } from '../../components/MediaList';
import { useAppShell } from '../../app/AppShellContext';
import { useLibraryDerivedContext } from '../../app/LibraryDerivedContext';
import { setLibraryQuery, setLibraryFocusedRowId, setLibrarySort } from './libraryStore';
import { isLibraryBlockingLoad, shouldShowLibraryRecovery } from './libraryBootState';
import { LibraryRecoveryPanel } from './LibraryRecoveryPanel';

export const LibraryContent = memo(function LibraryContent() {
  const shell = useAppShell();
  const derived = useLibraryDerivedContext();
  const showRecovery = shouldShowLibraryRecovery(shell.libraryBoot);
  const blockingLoad = isLibraryBlockingLoad(shell.libraryBoot, derived.visibleMedia.length > 0);

  return (
    <>
      {showRecovery && (
        <LibraryRecoveryPanel
          bootError={shell.libraryBootError}
          onRetry={() => void shell.retryLibraryScan()}
          onRebuild={() => void shell.resetLibraryIndex()}
          onOpenCache={() => undefined}
        />
      )}
      <MediaList
        libraryMode
        items={derived.visibleMedia}
        durationById={shell.durationById}
        totalMatches={derived.filteredMedia.totalMatches}
        listCapped={derived.filteredMedia.capped}
        selectedId={shell.focusedRowId}
        playingId={shell.sessionPlaying ? shell.currentMedia?.id : undefined}
        focusedId={shell.focusedRowId}
        listScopeKey={`${shell.filter}-${shell.sort}-${shell.query}-${shell.activePlaylistId ?? ''}`}
        query={shell.query}
        loading={blockingLoad && !showRecovery}
        libraryScanning={shell.libraryScanning}
        heroVisible={shell.heroVisible}
        playError={shell.playError}
        playlists={shell.playlists}
        layoutVersion={shell.layoutVersion}
        showQueueToggle={shell.showQueueToggle}
        showSidebarToggle={shell.layoutMode === 'narrow'}
        queueDrawerOpen={shell.queueDrawerOpen}
        sidebarDrawerOpen={shell.sidebarDrawerOpen}
        onToggleQueue={shell.toggleQueueDrawer}
        onToggleSidebar={() => shell.setSidebarDrawerOpen((open) => !open)}
        onDismissHero={shell.dismissHero}
        onQueryChange={setLibraryQuery}
        onImportFolder={shell.importFolder}
        onPlay={shell.playMedia}
        onQueue={shell.addToQueue}
        onFavorite={shell.toggleFavorite}
        onAddToPlaylist={shell.addToPlaylistHandler}
        onFocusRow={setLibraryFocusedRowId}
        sort={shell.sort}
        onSortChange={setLibrarySort}
        onOpenSettings={() => shell.setSettingsOpen(true)}
        settings={shell.settings}
        onOpenPlayer={() => {
          const track = shell.currentMedia;
          if (track?.filePath) shell.playMedia(track);
        }}
        playerMode={shell.playerMode}
      />
    </>
  );
});
