import { memo } from 'react';
import type { LibraryTitle } from '../../lib/mediaIntelligence/types';
import type { LocalAvailability, RecommendationItem } from '../../lib/metadata/types';
import { FranchiseTitleCover } from '../franchise/FranchiseTitleCover';
import { useI18n } from '../../i18n/I18nProvider';

function availabilityBadgeKey(availability: LocalAvailability): string {
  switch (availability) {
    case 'in_library':
      return 'catalog.availability.inLibrary';
    case 'partial':
      return 'catalog.availability.partial';
    case 'metadata_only':
      return 'catalog.availability.metadataOnly';
    default:
      return 'catalog.availability.notInLibrary';
  }
}

export interface MediaDiscoveryCardProps {
  item: RecommendationItem;
  localTitle?: LibraryTitle;
  primaryLabel: string;
  showPrimaryAction?: boolean;
  compact?: boolean;
  onOpen: () => void;
  onPrimaryAction?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}

export const MediaDiscoveryCard = memo(function MediaDiscoveryCard(props: MediaDiscoveryCardProps) {
  const { t } = useI18n();
  const { item } = props;
  const metaParts = [item.type.toUpperCase(), item.year].filter(Boolean);

  return (
    <article className={[
      'media-discovery-card',
      `media-discovery-card--${item.localAvailability}`,
      props.compact ? 'media-discovery-card--compact' : '',
    ].filter(Boolean).join(' ')}
      onContextMenu={props.onContextMenu}
    >
      <button type="button" className="media-discovery-card__open" onClick={props.onOpen}>
        <div className="media-discovery-card__poster">
          <FranchiseTitleCover
            title={item.title}
            mediaType={item.type}
            posterUrl={item.posterUrl}
            localTitle={props.localTitle}
          />
          <span className={`media-discovery-card__badge media-discovery-card__badge--${item.localAvailability}`}>
            {t(availabilityBadgeKey(item.localAvailability) as Parameters<typeof t>[0])}
          </span>
        </div>
        <div className="media-discovery-card__copy">
          <strong className="media-discovery-card__title">{item.title}</strong>
          {metaParts.length > 0 && (
            <p className="media-discovery-card__meta muted">{metaParts.join(' · ')}</p>
          )}
          {item.reasonKey && (
            <span className="media-discovery-card__reason">
              {t(item.reasonKey as Parameters<typeof t>[0])}
            </span>
          )}
        </div>
      </button>
      {props.showPrimaryAction && props.onPrimaryAction && (
        <button
          type="button"
          className="pill-button pill-button--accent media-discovery-card__action"
          onClick={(event) => {
            event.stopPropagation();
            props.onPrimaryAction?.();
          }}
        >
          {props.primaryLabel}
        </button>
      )}
    </article>
  );
});
