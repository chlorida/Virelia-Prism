import { memo, useEffect } from 'react';
import { LibraryPanel } from '../../components/LibraryPanel';
import { LibraryContent } from './LibraryContent';
import { useAppShell } from '../../app/AppShellContext';
import { useLibraryDerivedContext } from '../../app/LibraryDerivedContext';

/** @deprecated Layout is owned by AppModeRouter. Kept for tests and gradual migration. */
export const LibraryModeView = memo(function LibraryModeView() {
  const shell = useAppShell();
  const derived = useLibraryDerivedContext();

  useEffect(() => {
    if (import.meta.env?.DEV) {
      console.warn('[Virelia layout] LibraryModeView is deprecated — use AppModeRouter instead.');
    }
  }, []);

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
      <LibraryContent />
    </>
  );
});
