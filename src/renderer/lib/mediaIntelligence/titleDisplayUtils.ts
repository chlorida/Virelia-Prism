import type { LibraryTitle } from './types';
import type { TranslationKey } from '../../../shared/i18n';

export interface TitleCountDisplay {
  primary: string;
  secondary?: string;
  pill: string | number;
}

export function getNumberedEpisodeCount(title: LibraryTitle): number {
  return title.episodes?.filter((ep) => ep.episodeNumber != null).length ?? 0;
}

const OVA_HINT = /\b(ova|oad)\b/i;
const SPECIAL_HINT = /\b(special|sp)\b/i;

/** Display type for badges — prefers explicit OVA/Special signals over a loose movie hint. */
export function resolveTitleDisplayType(title: LibraryTitle): LibraryTitle['mediaType'] {
  if (title.mediaType === 'ova' || title.mediaType === 'special' || title.mediaType === 'series') {
    return title.mediaType;
  }

  const tagBlob = (title.versionTags ?? []).join(' ');
  const nameBlob = `${title.displayTitle} ${title.canonicalTitle ?? ''}`;
  const hintText = `${tagBlob} ${nameBlob}`;

  if (OVA_HINT.test(hintText)) return 'ova';
  if (SPECIAL_HINT.test(hintText)) return 'special';
  if (title.mediaType === 'movie') return 'movie';

  return title.mediaType;
}

export function titleDisplayKindLabel(
  title: LibraryTitle,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  const displayType = resolveTitleDisplayType(title);
  const isAudio = title.mediaType === 'album'
    || (title.items.length > 0 && title.items.every((item) => item.kind === 'audio'));
  if (isAudio) return t('media.kind.audio');

  switch (displayType) {
    case 'movie':
      return t('media.titles.kind.movie');
    case 'ova':
      return t('media.titles.kind.ova');
    case 'special':
      return t('media.titles.kind.special');
    case 'series':
      return t('media.titles.kind.series');
    case 'album':
      return t('media.titles.kind.album');
    default:
      return title.items.length === 1 ? t('media.titles.kind.single') : t('media.titles.kind.group');
  }
}

export function formatTitleCountDisplay(
  title: LibraryTitle,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  formatDuration: (seconds?: number) => string
): TitleCountDisplay {
  const episodeCount = getNumberedEpisodeCount(title);
  const { totalFileCount, duplicateVersionCount, mediaType } = title;
  const totalDuration = title.items.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);
  const versionsPerEpisode = episodeCount > 0 && duplicateVersionCount > 0
    ? Math.round(totalFileCount / episodeCount)
    : 0;

  if (mediaType === 'album') {
    const trackCount = episodeCount > 0 ? episodeCount : totalFileCount;
    return {
      primary: t('media.titles.tracks', { count: trackCount }),
      pill: trackCount,
    };
  }

  if (episodeCount > 0) {
    const primary = t('media.titles.episodes', { count: episodeCount });
    let secondary: string | undefined;
    if (duplicateVersionCount > 0) {
      if (versionsPerEpisode > 1 && totalFileCount === episodeCount * versionsPerEpisode) {
        secondary = t('media.titles.episodesVersionsEach', {
          files: totalFileCount,
          versions: versionsPerEpisode,
        });
      } else {
        secondary = t('media.titles.episodesWithFiles', {
          files: totalFileCount,
        });
      }
    }
    return { primary, secondary, pill: episodeCount };
  }

  if (mediaType === 'movie') {
    if (totalFileCount > 1) {
      return {
        primary: t('media.titles.movieVersions', { count: totalFileCount }),
        pill: 1,
      };
    }
    return {
      primary: totalDuration > 0
        ? t('media.titles.movieDuration', { duration: formatDuration(totalDuration) })
        : t('media.titles.kind.movie'),
      pill: 1,
    };
  }

  if (mediaType === 'ova' || mediaType === 'special') {
    if (totalFileCount > 1) {
      return {
        primary: t('media.titles.ovaVersions', { count: totalFileCount, type: t(`media.titles.kind.${mediaType}`) }),
        pill: 1,
      };
    }
    return {
      primary: t('media.titles.ovaSingle', { type: t(`media.titles.kind.${mediaType}`) }),
      pill: 1,
    };
  }

  if (totalFileCount > 1) {
    return {
      primary: t('media.titles.versions', { count: totalFileCount }),
      pill: totalFileCount,
    };
  }

  return {
    primary: totalDuration > 0 ? formatDuration(totalDuration) : t('media.titles.kind.single'),
    pill: totalFileCount,
  };
}
