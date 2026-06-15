import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { LibraryTitle } from '../../lib/mediaIntelligence/types';
import type { RecommendationItem } from '../../lib/metadata/types';
import { recommendationToLibraryTitle } from '../../lib/metadata/catalogShelfUtils';
import { CatalogShelfCard } from './CatalogShelfCard';
import { useI18n } from '../../i18n/I18nProvider';

interface DiscoverInfiniteRailProps {
  sectionId: string;
  items: RecommendationItem[];
  hasMore: boolean;
  loadingMore?: boolean;
  titleById?: Map<string, LibraryTitle>;
  listScopeKey?: string;
  onOpenItem: (item: RecommendationItem, localTitle?: LibraryTitle) => void;
  onContinueItem?: (item: RecommendationItem, localTitle?: LibraryTitle) => void;
  onLoadMore: () => void;
}

function RailLoadingCard() {
  return (
    <div className="discover-scroll-rail__card discover-scroll-rail__card--loading" aria-hidden="true">
      <div className="prism-title-card prism-title-card--movie">
        <div className="prism-title-card__fallback prism-title-card__fallback--embed">
          <div className="prism-title-card__fallback-shimmer" />
        </div>
      </div>
    </div>
  );
}

export const DiscoverInfiniteRail = memo(function DiscoverInfiniteRail(props: DiscoverInfiniteRailProps) {
  const { t } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  const syncArrows = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const maxScroll = track.scrollWidth - track.clientWidth;
    setCanScrollBack(track.scrollLeft > 8);
    setCanScrollForward(maxScroll - track.scrollLeft > 8);
  }, []);

  const scrollPage = useCallback((direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const delta = Math.max(280, Math.round(track.clientWidth * 0.82)) * direction;
    track.scrollBy({ left: delta, behavior: 'smooth' });
    window.setTimeout(syncArrows, 320);
  }, [syncArrows]);

  useEffect(() => {
    syncArrows();
  }, [props.items.length, props.listScopeKey, props.loadingMore, syncArrows]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const track = trackRef.current;
    if (!sentinel || !track) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && props.hasMore && !props.loadingMore) {
          props.onLoadMore();
        }
      },
      { root: track, threshold: 0.6 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [props.hasMore, props.loadingMore, props.onLoadMore]);

  return (
    <div className="discover-scroll-rail" data-section-id={props.sectionId}>
      <button
        type="button"
        className="discover-scroll-rail__arrow discover-scroll-rail__arrow--prev"
        aria-label={t('discover.rail.prev')}
        disabled={!canScrollBack}
        onClick={() => scrollPage(-1)}
      >
        ‹
      </button>

      <div
        ref={trackRef}
        className="discover-scroll-rail__track discover-row discover-row--rail prism-stagger-rail"
        onScroll={syncArrows}
      >
        {props.items.map((item) => {
          const localTitle = item.localTitleId ? props.titleById?.get(item.localTitleId) : undefined;
          const title = recommendationToLibraryTitle(item, localTitle);
          const key = item.catalogId ?? item.localTitleId ?? item.title;

          return (
            <div key={key} className="discover-scroll-rail__card prism-stagger-item">
              <CatalogShelfCard
                item={item}
                title={title}
                localTitle={localTitle}
                onOpen={() => props.onOpenItem(item, localTitle)}
                onContinue={() => props.onContinueItem?.(item, localTitle) ?? props.onOpenItem(item, localTitle)}
              />
            </div>
          );
        })}

        {props.loadingMore && <RailLoadingCard />}

        <div
          ref={sentinelRef}
          className="discover-scroll-rail__sentinel"
          aria-hidden="true"
        />
      </div>

      <button
        type="button"
        className="discover-scroll-rail__arrow discover-scroll-rail__arrow--next"
        aria-label={t('discover.rail.next')}
        disabled={!canScrollForward}
        onClick={() => scrollPage(1)}
      >
        ›
      </button>
    </div>
  );
});
