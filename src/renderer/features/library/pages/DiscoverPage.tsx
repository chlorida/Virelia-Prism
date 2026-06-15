import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import type { MediaItem } from '../../../../shared/types';

import type { LibraryTitle } from '../../../lib/mediaIntelligence/types';

import { useI18n } from '../../../i18n/I18nProvider';

import { useAppShell } from '../../../app/AppShellContext';

import { DiscoverInfiniteRail } from '../../../components/library/DiscoverInfiniteRail';

import { CatalogTitleShelf } from '../../../components/library/CatalogTitleShelf';

import {

  buildDiscoverSections,

} from '../../../lib/metadata/recommendationService';

import type { RecommendationItem } from '../../../lib/metadata/types';

import {
  buildOnlineDiscoverSections,
  fetchDiscoverSectionPage,
  type DiscoverCatalogSection,
} from '../../../lib/metadata/discoverCatalogService';

import { isOnlineCatalogAvailable } from '../../../lib/metadata/metadataSettings';
import { getGatewayAvailability } from '../../../lib/metadata/prismMetadataGatewayProvider';

import {

  navigateToCatalogTitle,

  navigateToLocalTitle,

} from '../libraryRouterStore';

import { resolveTitlePlayTarget } from '../../../lib/mediaIntelligence/titlePlaybackService';

import { playUiSound } from '../../../services/uiAudioService';



interface DiscoverPageProps {

  libraryTitles: LibraryTitle[];

  mediaItems: MediaItem[];

  onPlay: (item: MediaItem) => void;

}



const DISCOVER_RAIL_PAGE_SIZE = 12;



interface OnlineSectionPagination {

  page: number;

  hasMore: boolean;

  loadingMore: boolean;

}



function onlineSectionKey(catalogSectionId: string): string {

  return `online-${catalogSectionId}`;

}



function onlineToRecommendation(item: DiscoverCatalogSection['items'][number]): RecommendationItem {

  return {

    catalogId: item.catalogId,

    title: item.title,

    year: item.year,

    type: item.type,

    posterUrl: item.posterUrl,

    genres: item.genres,

    formatKind: item.formatKind,

    popularity: item.popularity,

    localAvailability: 'metadata_only',

    reason: item.provider,

    reasonKey: 'discover.reason.metadataOnly',

    score: item.confidence,

  };

}



export const DiscoverPage = memo(function DiscoverPage(props: DiscoverPageProps) {

  const { t } = useI18n();

  const shell = useAppShell();

  const [onlineSections, setOnlineSections] = useState<DiscoverCatalogSection[]>([]);

  const [onlineLoading, setOnlineLoading] = useState(false);

  const [sectionPagination, setSectionPagination] = useState<Record<string, OnlineSectionPagination>>({});



  const titleById = useMemo(

    () => new Map(props.libraryTitles.map((title) => [title.id, title])),

    [props.libraryTitles]

  );



  const localSections = useMemo(

    () => buildDiscoverSections({

      libraryTitles: props.libraryTitles,

      mediaItems: props.mediaItems,

    }),

    [props.libraryTitles, props.mediaItems]

  );



  useEffect(() => {
    const onlineAvailable = isOnlineCatalogAvailable(shell.settings);
    if (!onlineAvailable) {
      setOnlineSections([]);
      setSectionPagination({});
      setOnlineLoading(false);
      return;
    }
    let cancelled = false;
    setOnlineLoading(true);
    void buildOnlineDiscoverSections().then((sections) => {
      if (cancelled) return;
      setOnlineSections(sections);
      setSectionPagination((prev) => {
        const next = { ...prev };
        for (const section of sections) {
          const key = onlineSectionKey(section.id);
          if (!next[key]) {
            next[key] = { page: 0, hasMore: true, loadingMore: false };
          }
        }
        return next;
      });
      setOnlineLoading(false);
    });
    return () => { cancelled = true; };
  }, [shell.settings]);



  const loadMoreSection = useCallback((sectionKey: string, catalogSectionId: string) => {
    let nextPage = -1;

    setSectionPagination((prev) => {
      const current = prev[sectionKey];
      if (!current || current.loadingMore || !current.hasMore) return prev;
      nextPage = current.page + 1;
      return {
        ...prev,
        [sectionKey]: { ...current, loadingMore: true },
      };
    });

    if (nextPage < 0) return;

    void (async () => {
      try {
        const rawItems = await fetchDiscoverSectionPage(
          catalogSectionId,
          nextPage,
          DISCOVER_RAIL_PAGE_SIZE
        );

        setOnlineSections((prev) => {
          const index = prev.findIndex((section) => section.id === catalogSectionId);
          if (index < 0) return prev;

          const section = prev[index]!;
          const existingIds = new Set(section.items.map((item) => item.catalogId));
          const mergedItems = [
            ...section.items,
            ...rawItems.filter((item) => !existingIds.has(item.catalogId)),
          ];

          const next = [...prev];
          next[index] = { ...section, items: mergedItems };
          return next;
        });

        setSectionPagination((prev) => ({
          ...prev,
          [sectionKey]: {
            page: nextPage,
            hasMore: rawItems.length >= DISCOVER_RAIL_PAGE_SIZE,
            loadingMore: false,
          },
        }));
      } catch {
        setSectionPagination((prev) => {
          const current = prev[sectionKey];
          if (!current) return prev;
          return {
            ...prev,
            [sectionKey]: { ...current, loadingMore: false },
          };
        });
      }
    })();
  }, []);



  const hasOnlineFallback = onlineSections.length > 0;

  const gatewayStatus = getGatewayAvailability();

  const onlineCatalogLimited = gatewayStatus === 'unavailable' && !hasOnlineFallback;



  const sections = useMemo(() => {

    const online = onlineSections.map((section) => ({

      id: `online-${section.id}`,

      titleKey: section.titleKey,

      subtitleKey: section.subtitleKey,

      layout: section.layout ?? 'rail',

      items: section.items.map(onlineToRecommendation),

    }));

    const local = onlineCatalogLimited

      ? localSections.filter((section) => section.id !== 'metadata')

      : localSections;

    return [

      ...online,

      ...local.map((section) => ({
        id: section.id,
        titleKey: section.titleKey,
        subtitleKey: undefined,
        layout: 'grid' as const,
        items: section.items,
      })),

    ];

  }, [localSections, onlineSections, onlineCatalogLimited]);



  const openItem = (item: RecommendationItem) => {

    playUiSound('open');

    if (item.localTitleId) {

      navigateToLocalTitle(item.localTitleId);

      return;

    }

    if (item.catalogId) {

      navigateToCatalogTitle(item.catalogId);

    }

  };



  const continueItem = (item: RecommendationItem, localTitle?: LibraryTitle) => {

    if (localTitle) {

      const target = resolveTitlePlayTarget(localTitle);

      if (target) {

        props.onPlay(target.item);

        return;

      }

    }

    openItem(item);

  };



  const renderSection = (section: {

    id: string;

    titleKey: string;

    subtitleKey?: string;

    layout: 'rail' | 'grid';

    items: RecommendationItem[];

  }) => (

    <section key={section.id} className="discover-section library-browse-row">

      <div className="title-media-grid__heading-row discover-section__header">

        <h3 className="library-section-heading">{t(section.titleKey as Parameters<typeof t>[0])}</h3>

        {section.subtitleKey && (

          <p className="title-media-grid__hint muted">{t(section.subtitleKey as Parameters<typeof t>[0])}</p>

        )}

      </div>

      {section.layout === 'rail' ? (

        <DiscoverInfiniteRail

          sectionId={section.id.replace(/^online-/, '')}

          listScopeKey={section.id}

          items={section.items}

          titleById={titleById}

          onOpenItem={openItem}

          onContinueItem={continueItem}

          hasMore={sectionPagination[section.id]?.hasMore ?? true}

          loadingMore={sectionPagination[section.id]?.loadingMore}

          onLoadMore={() => loadMoreSection(section.id, section.id.replace(/^online-/, ''))}

        />

      ) : (

        <CatalogTitleShelf

          listScopeKey={section.id}

          items={section.items}

          titleById={titleById}

          onOpenItem={openItem}

          onContinueItem={continueItem}

        />

      )}

    </section>

  );



  return (

    <section className="discover-page title-media-grid">

      {onlineLoading && onlineSections.length === 0 && (

        <div className="discover-page__loading glass-inset" role="status">

          <p>{t('discover.loadingOnline')}</p>

        </div>

      )}

      {sections.length === 0 && !onlineLoading ? (

        <div className="discover-page__empty glass-inset">

          <p>{t('discover.starter.title')}</p>

          <p className="muted">{t('discover.starter.detail')}</p>

        </div>

      ) : (

        sections.map(renderSection)

      )}



      {(onlineCatalogLimited && !hasOnlineFallback) && sections.length > 0 && (

        <div className="discover-page__banner glass-inset" role="status">

          <p>{t('discover.onlineLimited.title')}</p>

          <p className="muted">{t('discover.onlineLimited.detail')}</p>

        </div>

      )}

    </section>

  );

});


