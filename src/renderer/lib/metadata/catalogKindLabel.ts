import type { CatalogMediaType } from './types';
import type { TranslationKey } from '../../../shared/i18n';

export interface CatalogKindInput {
  type: CatalogMediaType;
  formatKind?: string;
}

function normalizeFormatKind(value?: string): string {
  return String(value ?? '').trim().toLowerCase();
}

export function catalogKindLabel(
  item: CatalogKindInput,
  t: (key: TranslationKey) => string
): string {
  const kind = normalizeFormatKind(item.formatKind);

  switch (kind) {
    case 'scripted':
      return t('media.kind.show');
    case 'animation':
      return t('media.kind.anime');
    case 'documentary':
      return t('media.kind.documentary');
    case 'reality':
      return t('media.kind.reality');
    case 'news':
      return t('media.kind.news');
    case 'talk show':
      return t('media.kind.talkShow');
    case 'variety':
      return t('media.kind.variety');
    case 'awards':
      return t('media.kind.awards');
    case 'game show':
      return t('media.kind.gameShow');
    case 'sports':
      return t('media.kind.sports');
    case 'movie':
      return t('media.titles.kind.movie');
    case 'tv':
    case 'tv short':
      return t('media.titles.kind.series');
    case 'ova':
      return t('media.titles.kind.ova');
    case 'special':
    case 'ona':
      return t('media.titles.kind.special');
    default:
      break;
  }

  switch (item.type) {
    case 'movie':
      return t('media.titles.kind.movie');
    case 'ova':
      return t('media.titles.kind.ova');
    case 'special':
      return t('media.titles.kind.special');
    case 'anime':
      return t('media.kind.anime');
    case 'series':
      return t('media.titles.kind.series');
    default:
      return t('media.titles.kind.group');
  }
}

export function catalogKindCssClass(item: CatalogKindInput): string {
  const kind = normalizeFormatKind(item.formatKind);
  if (kind === 'animation' || item.type === 'anime') return 'anime';
  if (kind === 'documentary' || item.type === 'special') return 'special';
  if (item.type === 'movie' || kind === 'movie') return 'movie';
  if (item.type === 'ova' || kind === 'ova') return 'ova';
  if (kind === 'scripted' || kind === 'reality' || kind === 'talk show' || kind === 'variety') return 'series';
  return 'series';
}
