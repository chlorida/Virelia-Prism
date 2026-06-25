import { memo, useState } from 'react';
import type { LibraryTitle } from '../../../lib/mediaIntelligence/types';
import type { MediaItem } from '../../../../shared/types';
import { useI18n } from '../../../i18n/I18nProvider';
import { LibraryContextNav } from '../../../components/library/LibraryContextNav';
import { CatalogSearchPanel, type SearchTab } from '../../../components/CatalogSearchPanel';
import { navigatePrismBack } from '../libraryRouterStore';
import { playUiSound } from '../../../services/uiAudioService';

const SEARCH_TABS: SearchTab[] = ['all', 'library', 'metadata', 'franchises', 'people', 'files'];

interface SearchPageProps {
  query: string;
  libraryTitles: LibraryTitle[];
  mediaItems: MediaItem[];
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  onNavigateLibrary: () => void;
  onOpenTitle: (titleId: string) => void;
  onOpenCatalogTitle: (catalogTitleId: string, franchiseId?: string) => void;
  onPlayTitle: (title: LibraryTitle, episodeItemId?: string) => void;
  onOpenFranchise: (franchiseId: string) => void;
  onImportFolder?: () => void;
}

export const SearchPage = memo(function SearchPage(props: SearchPageProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<SearchTab>('all');

  const handleBack = () => {
    playUiSound('back');
    navigatePrismBack();
  };

  return (
    <section className="search-page">
      <LibraryContextNav
        onBack={handleBack}
        breadcrumbs={[
          { label: t('media.library.breadcrumbLibrary'), onClick: props.onNavigateLibrary },
          { label: t('nav.workspace.search') },
        ]}
      />

      <div className="search-page__tabs" role="tablist" aria-label={t('search.tabs.label')}>
        {SEARCH_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'shell-segment is-active' : 'shell-segment'}
            onClick={() => setTab(id)}
          >
            {t(`search.tab.${id}`)}
          </button>
        ))}
      </div>

      <CatalogSearchPanel
        query={props.query}
        tab={tab}
        libraryTitles={props.libraryTitles}
        mediaItems={props.mediaItems}
        onOpenTitle={props.onOpenTitle}
        onOpenCatalog={props.onOpenCatalogTitle}
        onPlayTitle={(title) => props.onPlayTitle(title)}
        onOpenFranchise={props.onOpenFranchise}
      />
    </section>
  );
});
