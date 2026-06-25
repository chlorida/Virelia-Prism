import { memo, useMemo, useState } from 'react';
import type { LibraryTitle } from '../../lib/mediaIntelligence/types';
import type { RecommendationItem } from '../../lib/metadata/types';
import { useI18n } from '../../i18n/I18nProvider';
import { catalogKindLabel, catalogKindCssClass } from '../../lib/metadata/catalogKindLabel';
import { useCardTilt } from '../../hooks/useCardTilt';
import { TitleCardFallback } from '../titles/TitleCardFallback';
import { FranchiseTitleCover } from '../franchise/FranchiseTitleCover';

interface CatalogShelfCardProps {
  item: RecommendationItem;
  title: LibraryTitle;
  localTitle?: LibraryTitle;
  onOpen: () => void;
  onContinue?: () => void;
}

export const CatalogShelfCard = memo(function CatalogShelfCard(props: CatalogShelfCardProps) {
  const { t } = useI18n();
  const [artFailed, setArtFailed] = useState(false);
  const { frameRef, onPointerMove, onPointerLeave, tiltActive } = useCardTilt(true);
  const kindLabel = catalogKindLabel(
    { type: props.item.type, formatKind: props.item.formatKind },
    t
  );
  const displayType = catalogKindCssClass({ type: props.item.type, formatKind: props.item.formatKind });
  const metaLine = useMemo(() => {
    const parts: string[] = [];
    if (props.item.year != null && displayType !== 'series') parts.push(String(props.item.year));
    if (displayType === 'series' && props.item.year != null) parts.push(String(props.item.year));
    return parts.join(' · ');
  }, [displayType, props.item.year]);

  const hasPoster = Boolean(props.item.posterUrl) && !artFailed;
  const cardClass = [
    'prism-title-card',
    `prism-title-card--${displayType}`,
    hasPoster ? 'has-artwork' : '',
    tiltActive ? 'prism-title-card--tilt' : '',
  ].filter(Boolean).join(' ');

  return (
    <article
      className={cardClass}
      onClick={props.onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          props.onOpen();
        }
      }}
      onPointerMove={tiltActive ? onPointerMove : undefined}
      onPointerLeave={tiltActive ? onPointerLeave : undefined}
    >
      <div ref={frameRef} className="prism-title-card__frame">
        {hasPoster ? (
          <img
            className="prism-title-card__art"
            src={props.item.posterUrl}
            alt=""
            decoding="async"
            draggable={false}
            style={{ objectFit: 'cover', objectPosition: 'center top' }}
            onError={() => setArtFailed(true)}
          />
        ) : props.localTitle ? (
          <FranchiseTitleCover
            title={props.item.title}
            mediaType={props.item.type}
            posterUrl={props.item.posterUrl}
            localTitle={props.localTitle}
          />
        ) : (
          <TitleCardFallback
            title={props.item.title}
            mediaType={displayType}
          />
        )}

        <div className="prism-title-card__glare" aria-hidden />
        <div className="prism-title-card__scrim" aria-hidden />
        <div className="prism-title-card__vignette" aria-hidden />

        <div className="prism-title-card__top">
          <span className={`prism-title-card__type prism-title-card__type--${displayType}`}>
            {kindLabel}
          </span>
        </div>

        <div className="prism-title-card__footer">
          <h3 className="prism-title-card__title" title={props.item.title}>
            {props.item.title}
          </h3>
          {metaLine && <p className="prism-title-card__meta">{metaLine}</p>}
          <div className="prism-title-card__actions">
            <button
              type="button"
              className="prism-title-card__btn prism-title-card__btn--secondary"
              onClick={(event) => {
                event.stopPropagation();
                props.onOpen();
              }}
            >
              {t('catalog.openDetails')}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
});
