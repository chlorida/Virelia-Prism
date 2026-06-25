import { useCallback, useMemo, useState } from 'react';
import type { MediaItem, Playlist } from '../../shared/types';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import { buildTitleContextMenuSections } from '../lib/contextMenuBuilders';
import { resolveTitlePlayTarget } from '../lib/mediaIntelligence/titlePlaybackService';
import { PrismCinemaContextMenu } from '../components/PrismCinemaContextMenu';
import { useI18n } from '../i18n/I18nProvider';
import { useStore } from '../lib/useStore';
import { favoritesStore } from '../features/library/favoritesStore';
import { playUiSound } from '../services/uiAudioService';

interface TitleContextMenuState {
  title: LibraryTitle;
  x: number;
  y: number;
}

export interface UseTitleContextMenuOptions {
  playlists: Playlist[];
  onPlay: (item: MediaItem) => void;
  onQueue: (item: MediaItem) => void;
  onFavorite: (item: MediaItem) => void;
  onAddToPlaylist: (playlistId: string, item: MediaItem) => void;
  onOpenTitle: (title: LibraryTitle) => void;
  onShowEpisodes?: (title: LibraryTitle) => void;
}

export function useTitleContextMenu(options: UseTitleContextMenuOptions) {
  const { t } = useI18n();
  const favoriteIds = useStore(favoritesStore, (state) => state.favoriteIds);
  const [menu, setMenu] = useState<TitleContextMenuState | null>(null);

  const openTitleContextMenu = useCallback((event: React.MouseEvent, title: LibraryTitle) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ title, x: event.clientX, y: event.clientY });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const sections = useMemo(() => {
    if (!menu) return [];
    return buildTitleContextMenuSections(menu.title, options.playlists, favoriteIds, t);
  }, [favoriteIds, menu, options.playlists, t]);

  const handleSelect = useCallback((id: string) => {
    if (!menu) return;
    const target = resolveTitlePlayTarget(menu.title);
    const item = target?.item;

    if (id === 'play' && item) {
      playUiSound('play');
      options.onPlay(item);
    } else if (id === 'queue' && item) {
      playUiSound('queue_add');
      options.onQueue(item);
    } else if (id === 'favorite' && item) {
      playUiSound('confirm');
      options.onFavorite(item);
    } else if (id === 'open') {
      playUiSound('open');
      options.onOpenTitle(menu.title);
    } else if (id === 'episodes') {
      playUiSound('open');
      (options.onShowEpisodes ?? options.onOpenTitle)(menu.title);
    } else if (id.startsWith('playlist:') && item) {
      playUiSound('queue_add');
      options.onAddToPlaylist(id.slice('playlist:'.length), item);
    }
    setMenu(null);
  }, [menu, options]);

  const contextMenu = (
    <PrismCinemaContextMenu
      open={Boolean(menu)}
      x={menu?.x ?? 0}
      y={menu?.y ?? 0}
      headerTitle={menu?.title.displayTitle}
      sections={sections}
      onSelect={handleSelect}
      onClose={closeMenu}
    />
  );

  return { openTitleContextMenu, contextMenu };
}
