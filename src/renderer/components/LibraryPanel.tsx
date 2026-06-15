import { memo, useMemo, useRef, useState, useEffect, useCallback } from 'react';

import type { AppSettings, MediaFilter, Playlist } from '../../shared/types';

import { useI18n } from '../i18n/I18nProvider';
import { useStore } from '../lib/useStore';
import { libraryRouterStore } from '../features/library/libraryRouterStore';
import {
  changeLibrarySecondary,
  changeWorkspacePrimary,
  librarySecondaryFromRoute,
  workspacePrimaryFromRoute,
} from '../features/library/libraryWorkspaceNavActions';
import { sidebarChromeStore, toggleSidebarCollapsed } from '../features/ui/sidebarChromeStore';
import { LibraryWorkspaceNav } from './library/LibraryWorkspaceNav';
import { LibrarySidebarContext } from './library/LibrarySidebarContext';

interface LibraryPanelProps {
  settings?: AppSettings;
  filter: MediaFilter;
  playlists: Playlist[];
  activePlaylistId?: string | null;
  counts: {
    all: number;
    audio: number;
    video: number;
    favorites: number;
    recent: number;
    pending?: boolean;
  };
  onFilterChange: (filter: MediaFilter) => void;
  onImportFolder: () => void;
  onCreatePlaylist: () => void;
  onSelectPlaylist: (playlistId: string) => void;
  onPlayPlaylist: (playlistId: string) => void;
  onRenamePlaylist: (playlistId: string) => void;
}

const FILTER_ICONS: Record<MediaFilter, string> = {
  all: '∞',
  audio: '♪',
  video: '▶',
  favorites: '♥',
  recent: '↺',
};

export const LibraryPanel = memo(function LibraryPanel(props: LibraryPanelProps) {
  const { t } = useI18n();
  const collapsed = useStore(sidebarChromeStore, (state) => state.collapsed);
  const [peekOpen, setPeekOpen] = useState(false);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const route = useStore(libraryRouterStore, (state) => state.route);
  const workspacePrimary = useMemo(() => workspacePrimaryFromRoute(route), [route]);
  const librarySecondary = useMemo(() => librarySecondaryFromRoute(route), [route]);
  const showFileFilters = workspacePrimary === 'library' && librarySecondary === 'files' && (!collapsed || peekOpen);
  const showPlaylists = workspacePrimary === 'library' && (!collapsed || peekOpen);
  const showContext = workspacePrimary !== 'library' && (!collapsed || peekOpen);

  const handleMouseEnter = useCallback(() => {
    if (!collapsed) return;
    peekTimerRef.current = setTimeout(() => setPeekOpen(true), 100);
  }, [collapsed]);

  const handleMouseLeave = useCallback(() => {
    if (peekTimerRef.current) {
      clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
    setPeekOpen(false);
  }, []);

  useEffect(() => () => {
    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
  }, []);

  const filters: Array<{ id: MediaFilter; label: string }> = [
    { id: 'all', label: t('library.filter.all') },
    { id: 'audio', label: t('library.filter.audio') },
    { id: 'video', label: t('library.filter.video') },
    { id: 'favorites', label: t('library.filter.favorites') },
    { id: 'recent', label: t('library.filter.recent') },
  ];

  return (
    <aside
      className={[
        'library-panel',
        collapsed ? 'library-panel--collapsed' : '',
        collapsed && peekOpen ? 'library-panel--peek' : '',
      ].filter(Boolean).join(' ')}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="library-panel__header">
        <button
          type="button"
          className="ghost-button library-panel__collapse-btn"
          onClick={toggleSidebarCollapsed}
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
        >
          <span className="library-panel__collapse-icon" aria-hidden>
            {collapsed ? '⫸' : '⫷'}
          </span>
        </button>
        <button
          type="button"
          className="ghost-button library-panel__import-btn"
          onClick={props.onImportFolder}
          title={t('library.importFolder')}
        >
          <span className="library-panel__import-icon" aria-hidden>+</span>
          <span className="library-panel__import-label">{t('library.importFolder')}</span>
        </button>
      </div>

      <div className="library-panel__scroll sidebar-body">
        <LibraryWorkspaceNav
          layout="sidebar"
          collapsed={collapsed && !peekOpen}
          primary={workspacePrimary}
          librarySecondary={librarySecondary}
          onPrimaryChange={changeWorkspacePrimary}
          onLibrarySecondaryChange={changeLibrarySecondary}
        />

        {showContext && <LibrarySidebarContext primary={workspacePrimary} />}

        {showFileFilters && (
          <section>
            <p className="section-label">{t('library.section')}</p>
            <div className="nav-stack">
              {filters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={props.filter === filter.id && !props.activePlaylistId ? 'nav-item active' : 'nav-item'}
                  onClick={() => props.onFilterChange(filter.id)}
                >
                  <span className="nav-item__label">
                    <span className="nav-item__icon" aria-hidden>{FILTER_ICONS[filter.id]}</span>
                    {filter.label}
                  </span>
                  <strong>
                    {props.counts.pending && props.counts[filter.id] === 0 && filter.id !== 'favorites'
                      ? '—'
                      : props.counts[filter.id]}
                  </strong>
                </button>
              ))}
            </div>
          </section>
        )}

        {showPlaylists && (
          <section>
            <p className="section-label">{t('library.playlists')}</p>
            <div className="playlist-stack">
              {props.playlists.map((playlist) => (
                <div
                  key={playlist.id}
                  className={props.activePlaylistId === playlist.id ? 'playlist-chip active' : 'playlist-chip'}
                >
                  <button
                    type="button"
                    className="playlist-chip__main"
                    onClick={() => props.onSelectPlaylist(playlist.id)}
                    onDoubleClick={() => props.onPlayPlaylist(playlist.id)}
                    title={t('library.playlistHint')}
                  >
                    <span className="playlist-chip__name">{playlist.name}</span>
                    {playlist.smart && (
                      <span className="playlist-badge prism-badge" aria-label={t('library.playlist.smart')}>
                        {t('library.playlist.smart')}
                      </span>
                    )}
                  </button>
                  {!playlist.smart && (
                    <button
                      type="button"
                      className="playlist-chip__rename"
                      aria-label={t('library.renamePlaylist')}
                      title={t('library.renamePlaylist')}
                      onClick={() => props.onRenamePlaylist(playlist.id)}
                    >
                      ✎
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="ghost-button wide" onClick={props.onCreatePlaylist}>
              {t('library.newPlaylist')}
            </button>
          </section>
        )}
      </div>

      <div className="panel-footer library-panel__footer sidebar-footer">
        <p
          className="library-panel__indexed"
          title={t('library.foldersIndexed', { count: props.settings?.libraryFolders.length ?? 0 })}
        >
          {collapsed && !peekOpen ? (
            <span className="library-panel__indexed-compact" aria-label={t('library.foldersIndexed', { count: props.settings?.libraryFolders.length ?? 0 })}>
              {props.settings?.libraryFolders.length ?? 0}
            </span>
          ) : (
            t('library.foldersIndexed', { count: props.settings?.libraryFolders.length ?? 0 })
          )}
        </p>
      </div>
    </aside>
  );
});
