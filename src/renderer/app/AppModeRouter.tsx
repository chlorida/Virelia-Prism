import { memo, useEffect, useState } from 'react';
import { LibraryPanel } from '../components/LibraryPanel';
import { LibraryContent } from '../features/library/LibraryContent';
import { VideoPlayerModeView } from '../features/player/VideoPlayerModeView';
import { RightSidePanel } from '../features/ui/RightSidePanel';
import { useAppShell } from './AppShellContext';
import { useLibraryDerivedContext } from './LibraryDerivedContext';
import { usePlaybackSelector } from '../playback/usePlayback';
import { useDevRenderCount } from '../lib/devRenderProfile';
import { useStore } from '../lib/useStore';
import { miniShellTransitionStore } from '../features/mini/miniShellTransitionStore';
import { playerModeStore } from '../features/ui/playerModeStore';
import { forceClearVideoFullscreenChrome } from '../lib/domFullscreen';

/**
 * Single app-content layout owner:
 * - column 1: library sidebar (hidden in watch mode)
 * - column 2: library list OR video main
 * - column 3: right rail (exactly once)
 */
export const AppModeRouter = memo(function AppModeRouter() {
  const shell = useAppShell();
  const derived = useLibraryDerivedContext();
  const isVideo = usePlaybackSelector((s) => s.isVideo);
  const miniTransition = useStore(miniShellTransitionStore, (state) => state);
  const returnMode = useStore(playerModeStore, (state) => state.returnMode);
  const effectivePlayerMode = miniTransition.phase === 'animating' && miniTransition.direction === 'from-mini'
    ? returnMode
    : shell.playerMode;
  const watchActive = effectivePlayerMode === 'player' && isVideo;
  const [libraryListMounted, setLibraryListMounted] = useState(!watchActive);

  useEffect(() => {
    if (watchActive) {
      setLibraryListMounted(false);
      return;
    }
    setLibraryListMounted(true);
  }, [watchActive]);

  useEffect(() => {
    if (watchActive) return;
    forceClearVideoFullscreenChrome();
  }, [watchActive]);

  useDevRenderCount('AppModeRouter');

  return (
    <>
      <LibraryPanel
        settings={shell.settings}
        filter={shell.filter}
        playlists={shell.playlists}
        activePlaylistId={shell.activePlaylistId}
        counts={derived.counts}
        onFilterChange={shell.handleFilterChange}
        onImportFolder={shell.importFolder}
        onCreatePlaylist={() => shell.setPrompt({ type: 'create-playlist' })}
        onSelectPlaylist={shell.selectPlaylist}
        onPlayPlaylist={shell.playPlaylist}
        onRenamePlaylist={(playlistId) => {
          const playlist = shell.playlists.find((item) => item.id === playlistId);
          if (!playlist || playlist.smart) return;
          shell.setPrompt({ type: 'rename-playlist', playlistId, defaultValue: playlist.name });
        }}
      />

      {libraryListMounted && (
        <div
          className={`media-list-host${watchActive ? ' media-list-host--parked' : ''}`}
          aria-hidden={watchActive}
        >
          <LibraryContent />
        </div>
      )}

      {watchActive && (
        <div className={`watch-main-host watch-main-host--enter${shell.videoTheaterOpen ? ' watch-main-host--theater' : ''}`}>
          <VideoPlayerModeView />
        </div>
      )}

      <RightSidePanel />
    </>
  );
});
