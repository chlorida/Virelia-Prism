import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MediaItem } from '../../../shared/types';
import type { LibraryTitle } from '../../lib/mediaIntelligence/types';
import type { RecommendationItem } from '../../lib/metadata/types';
import type { MetadataSearchResult } from '../../lib/metadata/types';

import { useI18n } from '../../i18n/I18nProvider';
import { useAppShell } from '../../app/AppShellContext';
import { useStore } from '../../lib/useStore';
import { watchlistStore } from '../../features/library/watchlistStore';
import { buildUserAffinityProfile } from '../../lib/metadata/userAffinityService';
import { resolveLocalAvailability } from '../../lib/metadata/catalogService';
import { filterCatalogResults } from '../../lib/metadata/contentPolicyService';
import { fetchDiscoverSectionPage } from '../../lib/metadata/discoverCatalogService';
import {
  getNextDiscoverSections,
  INITIAL_DISCOVER_FEED_CURSOR,
  type DiscoverFeedContext,
  type DiscoverFeedCursor,
  type DiscoverFeedSectionModel,
} from '../../lib/metadata/discoverFeedService';
import { DiscoverInfiniteRail } from './DiscoverInfiniteRail';

const DISCOVER_RAIL_PAGE_SIZE = 12;

interface SectionPagination {
  page: number;
  hasMore: boolean;
  loadingMore: boolean;
}

function mapPageItem(
  item: MetadataSearchResult,
  context: DiscoverFeedContext
): RecommendationItem {
  const { availability, localTitleId } = resolveLocalAvailability(item.catalogId, context.libraryTitles);
  return {
    catalogId: item.catalogId,
    localTitleId,
    title: item.title,
    year: item.year,
    type: item.type,
    posterUrl: item.posterUrl,
    genres: item.genres,
    formatKind: item.formatKind,
    popularity: item.popularity,
    localAvailability: availability,
    reason: '',
    reasonKey: 'discover.reason.recommended',
    score: item.confidence ?? 0,
  };
}

export const DiscoverFeed = memo(function DiscoverFeed(props: {
  libraryTitles: LibraryTitle[];
  mediaItems: MediaItem[];
  favoriteIds: Set<string>;
  onOpenItem: (item: RecommendationItem, localTitle?: LibraryTitle) => void;
  onContinueItem: (item: RecommendationItem, localTitle?: LibraryTitle) => void;
}) {
  const { t } = useI18n();
  const shell = useAppShell();
  const watchlistItems = useStore(watchlistStore, (state) => state.items);

  const watchlistCatalogIds = useMemo(
    () => watchlistItems.map((item) => item.id),
    [watchlistItems]
  );

  const includeAdultContent = shell.settings.discovery?.includeAdultContent ?? false;

  const affinity = useMemo(
    () => buildUserAffinityProfile({
      libraryTitles: props.libraryTitles,
      mediaItems: props.mediaItems,
      favoriteIds: props.favoriteIds,
      watchlistCatalogIds,
    }),
    [props.libraryTitles, props.mediaItems, props.favoriteIds, watchlistCatalogIds]
  );

  const feedContext = useMemo<DiscoverFeedContext>(
    () => ({
      libraryTitles: props.libraryTitles,
      mediaItems: props.mediaItems,
      favoriteIds: props.favoriteIds,
      watchlistCatalogIds,
      includeAdultContent,
      affinity,
    }),
    [
      props.libraryTitles,
      props.mediaItems,
      props.favoriteIds,
      watchlistCatalogIds,
      includeAdultContent,
      affinity,
    ]
  );

  const titleById = useMemo(
    () => new Map(props.libraryTitles.map((title) => [title.id, title])),
    [props.libraryTitles]
  );

  const [sections, setSections] = useState<DiscoverFeedSectionModel[]>([]);
  const [cursor, setCursor] = useState<DiscoverFeedCursor | null>(INITIAL_DISCOVER_FEED_CURSOR);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [sectionPagination, setSectionPagination] = useState<Record<string, SectionPagination>>({});
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const initSectionPagination = useCallback((batch: DiscoverFeedSectionModel[]) => {
    setSectionPagination((prev) => {
      const next = { ...prev };
      for (const section of batch) {
        if (!next[section.id]) {
          next[section.id] = {
            page: 0,
            hasMore: section.kind !== 'local' && section.hasMore,
            loadingMore: false,
          };
        }
      }
      return next;
    });
  }, []);

  const loadNextBatch = useCallback(async () => {
    if (loadingRef.current || cursor === null) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await getNextDiscoverSections(cursor, feedContext);
      setSections((prev) => [...prev, ...result.sections]);
      setCursor(result.nextCursor);
      initSectionPagination(result.sections);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [cursor, feedContext, initSectionPagination]);

  useEffect(() => {
    setSections([]);
    setCursor(INITIAL_DISCOVER_FEED_CURSOR);
    setSectionPagination({});
    setInitialLoaded(false);
    loadingRef.current = false;

    let cancelled = false;
    setLoading(true);
    loadingRef.current = true;

    void getNextDiscoverSections(INITIAL_DISCOVER_FEED_CURSOR, feedContext).then((result) => {
      if (cancelled) return;
      setSections(result.sections);
      setCursor(result.nextCursor);
      initSectionPagination(result.sections);
      setLoading(false);
      setInitialLoaded(true);
      loadingRef.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [feedContext, initSectionPagination]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !loadingRef.current && cursor !== null) {
          void loadNextBatch();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadNextBatch]);

  const loadMoreSection = useCallback((sectionId: string) => {
    const section = sections.find((entry) => entry.id === sectionId);
    if (!section || section.kind === 'local') return;

    let nextPage = -1;
    setSectionPagination((prev) => {
      const current = prev[sectionId];
      if (!current || current.loadingMore || !current.hasMore) return prev;
      nextPage = current.page + 1;
      return {
        ...prev,
        [sectionId]: { ...current, loadingMore: true },
      };
    });

    if (nextPage < 0) return;

    void (async () => {
      try {
        const rawItems = await fetchDiscoverSectionPage(
          sectionId,
          nextPage,
          DISCOVER_RAIL_PAGE_SIZE
        );
        const filtered = filterCatalogResults(rawItems, feedContext.includeAdultContent);
        const mapped = filtered.map((item) => mapPageItem(item, feedContext));

        setSections((prev) => {
          const index = prev.findIndex((entry) => entry.id === sectionId);
          if (index < 0) return prev;

          const currentSection = prev[index]!;
          const existingIds = new Set(
            currentSection.items.map((item) => item.catalogId ?? item.localTitleId ?? item.title)
          );
          const mergedItems = [
            ...currentSection.items,
            ...mapped.filter((item) => {
              const key = item.catalogId ?? item.localTitleId ?? item.title;
              return !existingIds.has(key);
            }),
          ];

          const next = [...prev];
          next[index] = { ...currentSection, items: mergedItems };
          return next;
        });

        setSectionPagination((prev) => ({
          ...prev,
          [sectionId]: {
            page: nextPage,
            hasMore: filtered.length >= DISCOVER_RAIL_PAGE_SIZE,
            loadingMore: false,
          },
        }));
      } catch {
        setSectionPagination((prev) => {
          const current = prev[sectionId];
          if (!current) return prev;
          return {
            ...prev,
            [sectionId]: { ...current, loadingMore: false },
          };
        });
      }
    })();
  }, [sections, feedContext]);

  if (sections.length === 0 && initialLoaded && !loading) {
    return (
      <div className="discover-page__empty glass-inset prism-empty-rise">
        <p>{t('discover.starter.title')}</p>
        <p className="muted">{t('discover.starter.detail')}</p>
      </div>
    );
  }

  return (
    <>
      {sections.map((section) => (
        <section key={section.id} className="discover-section library-browse-row">
          <div className="title-media-grid__heading-row discover-section__header">
            <h3 className="library-section-heading">
              {t(section.titleKey as Parameters<typeof t>[0])}
            </h3>
            {section.subtitleKey && (
              <p className="title-media-grid__hint muted">
                {t(section.subtitleKey as Parameters<typeof t>[0])}
              </p>
            )}
          </div>

          <DiscoverInfiniteRail
            sectionId={section.id}
            listScopeKey={section.id}
            items={section.items}
            titleById={titleById}
            onOpenItem={props.onOpenItem}
            onContinueItem={props.onContinueItem}
            hasMore={sectionPagination[section.id]?.hasMore ?? false}
            loadingMore={sectionPagination[section.id]?.loadingMore}
            onLoadMore={() => loadMoreSection(section.id)}
          />
        </section>
      ))}

      {loading && (
        <div className="discover-page__loading glass-inset" role="status">
          <p>{t('discover.feed.loading')}</p>
        </div>
      )}

      <div ref={sentinelRef} className="discover-feed__sentinel" aria-hidden="true" />
    </>
  );
});
