import { memo, type ReactNode } from 'react';
import type { LibraryTitle } from '../../lib/mediaIntelligence/types';
import type { RecommendationItem } from '../../lib/metadata/types';
import { recommendationToLibraryTitle } from '../../lib/metadata/catalogShelfUtils';
import { CatalogShelfCard } from './CatalogShelfCard';

interface CatalogTitleShelfProps {
  items: RecommendationItem[];
  titleById?: Map<string, LibraryTitle>;
  playingId?: string;
  listScopeKey?: string;
  onOpenItem: (item: RecommendationItem, localTitle?: LibraryTitle) => void;
  onContinueItem?: (item: RecommendationItem, localTitle?: LibraryTitle) => void;
  renderCardFooter?: (item: RecommendationItem, localTitle?: LibraryTitle) => ReactNode;
}

export const CatalogTitleShelf = memo(function CatalogTitleShelf(props: CatalogTitleShelfProps) {
  return (
    <div
      className="title-media-grid__cards prism-stagger-grid"
      key={props.listScopeKey}
    >
      {props.items.map((item) => {
        const localTitle = item.localTitleId ? props.titleById?.get(item.localTitleId) : undefined;
        const title = recommendationToLibraryTitle(item, localTitle);
        const key = item.catalogId ?? item.localTitleId ?? item.title;

        return (
          <div key={key} className="catalog-title-shelf__item prism-stagger-item">
            <CatalogShelfCard
              item={item}
              title={title}
              localTitle={localTitle}
              onOpen={() => props.onOpenItem(item, localTitle)}
              onContinue={() => props.onContinueItem?.(item, localTitle) ?? props.onOpenItem(item, localTitle)}
            />
            {props.renderCardFooter?.(item, localTitle)}
          </div>
        );
      })}
    </div>
  );
});
