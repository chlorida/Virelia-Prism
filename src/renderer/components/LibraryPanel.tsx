import { memo, useMemo, useRef, useState, useEffect, useCallback } from 'react';

import type { AppSettings, MediaFilter, Playlist } from '../../shared/types';

import { useI18n } from '../i18n/I18nProvider';
import { useStore } from '../lib/useStore';
import { useAppShell } from '../app/AppShellContext';
import { useAppLayoutMode } from '../hooks/useAppLayoutMode';
import { AnimatedListItem } from './AnimatedListItem';
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
import { DownloadActivityButton } from './library/DownloadActivityButton';

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

const PEEK_MOTION_MS = 260;

export const LibraryPanel = memo(function LibraryPanel(props: LibraryPanelProps) {
  const { t } = useI18n();
  const shell = useAppShell();
  const layoutMode = useAppLayoutMode();
  const collapsed = useStore(sidebarChromeStore, (state) => state.collapsed);
  const pinSidebar = shell.settings.shell?.pinSidebar ?? false;
  const peekEnabled = collapsed && !pinSidebar && layoutMode !== 'narrow';
  const [peekOpen, setPeekOpen] = useState(false);
  const [peekClosing, setPeekClosing] = useState(false);
  const peekOpenRef = useRef(false);
  const peekClosingRef = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const peekCloseTimerRef = useRef<number | null>(null);
  peekOpenRef.current = peekOpen;
  peekClosingRef.current = peekClosing;
  const peekContentVisible = peekOpen;
  const sidebarContentExpanded = !collapsed || peekContentVisible;

  const clearPeekCloseTimer = useCallback(() => {
    if (!peekCloseTimerRef.current) return;
    window.clearTimeout(peekCloseTimerRef.current);
    peekCloseTimerRef.current = null;
  }, []);

  const finishPeekClose = useCallback(() => {
    peekClosingRef.current = false;
    setPeekClosing(false);
    clearPeekCloseTimer();
  }, [clearPeekCloseTimer]);

  const closePeek = useCallback(() => {
    if (!peekOpenRef.current || peekClosingRef.current) return;
    setPeekOpen(false);
    peekClosingRef.current = true;
    setPeekClosing(true);
    clearPeekCloseTimer();
  }, [clearPeekCloseTimer]);

  useEffect(() => {
    if (!peekClosing || !collapsed) return;
    const panel = panelRef.current;
    if (!panel) {
      finishPeekClose();
      return;
    }

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== panel) return;
      if (event.propertyName !== 'width' && event.propertyName !== 'max-width') return;
      finishPeekClose();
    };

    panel.addEventListener('transitionend', onTransitionEnd);
    peekCloseTimerRef.current = window.setTimeout(finishPeekClose, PEEK_MOTION_MS + 64);
    return () => {
      panel.removeEventListener('transitionend', onTransitionEnd);
      clearPeekCloseTimer();
    };
  }, [peekClosing, collapsed, finishPeekClose, clearPeekCloseTimer]);

  useEffect(() => {
    if (!collapsed) {
      clearPeekCloseTimer();
      setPeekOpen(false);
      setPeekClosing(false);
      peekClosingRef.current = false;
    }
  }, [collapsed, clearPeekCloseTimer]);

  useEffect(() => {
    if (peekEnabled) return;
    clearPeekCloseTimer();
    setPeekOpen(false);
    setPeekClosing(false);
    peekClosingRef.current = false;
  }, [peekEnabled, clearPeekCloseTimer]);

  useEffect(() => {
    if (!peekEnabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!peekOpenRef.current) return;
      event.preventDefault();
      closePeek();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [peekEnabled, closePeek]);
  const route = useStore(libraryRouterStore, (state) => state.route);
  const workspacePrimary = useMemo(() => workspacePrimaryFromRoute(route), [route]);
  const librarySecondary = useMemo(() => librarySecondaryFromRoute(route), [route]);
  const onDownloadsPage = route.page === 'downloads';
  const showFileFilters = workspacePrimary === 'library' && librarySecondary === 'files' && sidebarContentExpanded && !onDownloadsPage;
  const showPlaylists = workspacePrimary === 'library' && sidebarContentExpanded && !onDownloadsPage;
  const showContext = (workspacePrimary !== 'library' || onDownloadsPage) && sidebarContentExpanded;

  const handleToggleCollapse = () => {
    if (pinSidebar) return;
    if (peekOpen || peekClosing) {
      clearPeekCloseTimer();
      setPeekOpen(false);
      setPeekClosing(false);
      peekClosingRef.current = false;
    }
    toggleSidebarCollapsed();
  };

  useEffect(() => {
    if (!peekEnabled) {
      return;
    }

    const SLOP = 14;
    const OPEN_MS = 120;
    const CLOSE_MS = 180;
    const GUARD_MS = 280;

    let openTimer: ReturnType<typeof setTimeout> | null = null;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    let openedAt = 0;

    const clearOpenTimer = () => {
      if (!openTimer) return;
      clearTimeout(openTimer);
      openTimer = null;
    };

    const clearCloseTimer = () => {
      if (!closeTimer) return;
      clearTimeout(closeTimer);
      closeTimer = null;
    };

    const inRect = (x: number, y: number, rect: DOMRect, pad = 0) => (
      x >= rect.left - pad
      && x <= rect.right + pad
      && y >= rect.top - pad
      && y <= rect.bottom + pad
    );

    const getRailRect = (): DOMRect | null => {
      const panel = panelRef.current;
      const content = panel?.closest('.app-content');
      if (!panel || !content) return null;

      const contentRect = content.getBoundingClientRect();
      const styles = getComputedStyle(content);
      const padLeft = parseFloat(styles.paddingLeft) || 0;
      const padTop = parseFloat(styles.paddingTop) || 0;
      const padBottom = parseFloat(styles.paddingBottom) || 0;
      const railWidth = parseFloat(styles.getPropertyValue('--sidebar-width-collapsed')) || 72;

      return new DOMRect(
        contentRect.left + padLeft,
        contentRect.top + padTop,
        railWidth,
        contentRect.height - padTop - padBottom,
      );
    };

    const isOverRightPanel = (x: number, y: number) => {
      const node = document.querySelector<HTMLElement>('.smart-right-panel, .queue-drawer-host.is-open');
      if (!node) return false;
      return inRect(x, y, node.getBoundingClientRect(), SLOP);
    };

    const isOverSidebar = (x: number, y: number) => {
      const rail = getRailRect();
      if (!rail) return false;

      if (peekOpenRef.current || peekClosingRef.current) {
        const panelRect = panelRef.current?.getBoundingClientRect();
        if (panelRect && inRect(x, y, panelRect, SLOP)) return true;
      }

      return inRect(x, y, rail, SLOP);
    };

    const scheduleOpen = () => {
      if (peekOpenRef.current) {
        clearCloseTimer();
        return;
      }

      if (peekClosingRef.current) {
        clearCloseTimer();
        clearPeekCloseTimer();
        peekClosingRef.current = false;
        setPeekClosing(false);
        setPeekOpen(true);
        openedAt = Date.now();
        return;
      }

      if (openTimer) return;
      clearCloseTimer();
      openTimer = setTimeout(() => {
        openTimer = null;
        openedAt = Date.now();
        peekClosingRef.current = false;
        clearPeekCloseTimer();
        setPeekClosing(false);
        setPeekOpen(true);
      }, OPEN_MS);
    };

    const scheduleClose = () => {
      if (Date.now() - openedAt < GUARD_MS) return;
      if (!peekOpenRef.current || peekClosingRef.current) return;
      clearOpenTimer();
      if (closeTimer) return;
      closeTimer = setTimeout(() => {
        closeTimer = null;
        closePeek();
      }, CLOSE_MS);
    };

    const onPointerMove = (event: PointerEvent) => {
      const { clientX: x, clientY: y } = event;

      if (isOverSidebar(x, y)) {
        scheduleOpen();
        clearCloseTimer();
        return;
      }

      if (isOverRightPanel(x, y)) {
        clearOpenTimer();
        clearCloseTimer();
        if (peekOpenRef.current) closePeek();
        return;
      }

      scheduleClose();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      clearOpenTimer();
      clearCloseTimer();
      clearPeekCloseTimer();
    };
  }, [peekEnabled, closePeek, clearPeekCloseTimer, finishPeekClose]);

  const filters: Array<{ id: MediaFilter; label: string }> = [
    { id: 'all', label: t('library.filter.all') },
    { id: 'audio', label: t('library.filter.audio') },
    { id: 'video', label: t('library.filter.video') },
    { id: 'favorites', label: t('library.filter.favorites') },
    { id: 'recent', label: t('library.filter.recent') },
  ];

  return (
    <aside
      ref={panelRef}
      className={[
        'library-panel',
        collapsed ? 'library-panel--collapsed' : '',
        collapsed && peekOpen ? 'library-panel--peek' : '',
        peekClosing ? 'library-panel--peek-closing' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="library-panel__header">
        <button
          type="button"
          className="ghost-button library-panel__collapse-btn"
          onClick={handleToggleCollapse}
          disabled={pinSidebar}
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          title={
            pinSidebar
              ? t('settings.shell.pinSidebar')
              : collapsed
                ? t('sidebar.expand')
                : t('sidebar.collapse')
          }
        >
          <span className="library-panel__collapse-icon" aria-hidden>
            {collapsed ? '»' : '«'}
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
          collapsed={collapsed}
          labelsHidden={collapsed && !peekContentVisible}
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
                <AnimatedListItem key={playlist.id} itemKey={playlist.id}>
                <div
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
                </AnimatedListItem>
              ))}
            </div>
            <button type="button" className="ghost-button wide" onClick={props.onCreatePlaylist}>
              {t('library.newPlaylist')}
            </button>
          </section>
        )}
      </div>

      <div className="panel-footer library-panel__footer sidebar-footer">
        <DownloadActivityButton collapsed={collapsed} peekExpanded={peekContentVisible} />
        <p
          className="library-panel__indexed"
          title={t('library.foldersIndexed', { count: props.settings?.libraryFolders.length ?? 0 })}
        >
          {collapsed && !peekContentVisible ? (
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
