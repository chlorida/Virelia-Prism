import type { Playlist } from '../../shared/types';
import type { TranslationKey } from '../../shared/i18n';
import type { LibraryTitle } from './mediaIntelligence/types';
import type { CinemaContextMenuSection } from '../components/PrismCinemaContextMenu';
import { resolveTitleDisplayType } from './mediaIntelligence/titleDisplayUtils';
import { resolveTitlePlayTarget } from './mediaIntelligence/titlePlaybackService';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

function buildPlaylistSection(
  playlists: Playlist[],
  t: Translate,
  disabled?: boolean
): CinemaContextMenuSection | null {
  const userPlaylists = playlists.filter((playlist) => !playlist.smart);
  if (userPlaylists.length === 0) return null;

  return {
    id: 'playlists',
    title: t('media.context.playlistsSection'),
    layout: 'grid',
    items: userPlaylists.map((playlist) => ({
      id: `playlist:${playlist.id}`,
      label: playlist.name,
      icon: 'playlist' as const,
      disabled,
    })),
  };
}

export function buildMediaContextMenuSections(
  playlists: Playlist[],
  t: Translate,
  options?: {
    favoriteIds?: Set<string>;
    mediaItemId?: string;
    isFavorite?: boolean;
  }
): CinemaContextMenuSection[] {
  const mediaItemId = options?.mediaItemId;
  const isFavorite = options?.isFavorite
    ?? (mediaItemId ? Boolean(options?.favoriteIds?.has(mediaItemId)) : false);
  const disabled = !mediaItemId;

  const sections: CinemaContextMenuSection[] = [
    {
      id: 'primary',
      layout: 'list',
      items: [
        { id: 'play', label: t('media.context.play'), icon: 'play', disabled },
        { id: 'queue', label: t('media.context.queue'), icon: 'queue', disabled },
        {
          id: 'favorite',
          label: isFavorite ? t('media.context.removeFavorite') : t('media.context.favorite'),
          icon: 'heart',
          active: isFavorite,
          disabled,
        },
      ],
    },
  ];

  const playlistSection = buildPlaylistSection(playlists, t, disabled);
  if (playlistSection) sections.push(playlistSection);

  return sections;
}

export function buildTitleContextMenuSections(
  title: LibraryTitle,
  playlists: Playlist[],
  favoriteIds: Set<string>,
  t: Translate
): CinemaContextMenuSection[] {
  const playTarget = resolveTitlePlayTarget(title);
  const mediaItemId = playTarget?.item.id;
  const isFavorite = mediaItemId ? favoriteIds.has(mediaItemId) : false;
  const displayType = resolveTitleDisplayType(title);
  const isSeries = displayType === 'series' && title.uniqueEpisodeCount > 1;
  const disabled = !mediaItemId;

  const sections: CinemaContextMenuSection[] = [
    {
      id: 'primary',
      layout: 'list',
      items: [
        { id: 'play', label: t('media.context.play'), icon: 'play', disabled },
        { id: 'queue', label: t('media.context.queue'), icon: 'queue', disabled },
        {
          id: 'favorite',
          label: isFavorite ? t('media.context.removeFavorite') : t('media.context.favorite'),
          icon: 'heart',
          active: isFavorite,
          disabled,
        },
        { id: 'open', label: t('media.context.openTitle'), icon: 'open' },
        ...(isSeries
          ? [{ id: 'episodes', label: t('media.titles.episodesAction'), icon: 'episodes' as const }]
          : []),
      ],
    },
  ];

  const playlistSection = buildPlaylistSection(playlists, t, disabled);
  if (playlistSection) sections.push(playlistSection);

  return sections;
}
