import { memo } from 'react';
import type { LibraryTitle } from '../../lib/mediaIntelligence/types';
import type { ContentMode } from '../../features/content/contentModeTypes';
import type { FranchiseCatalogEntry } from '../../lib/mediaIntelligence/franchise/franchiseCatalog';
import type { CatalogTitle } from '../../lib/metadata/types';
import type { LibraryPage } from '../../lib/libraryPageTypes';
import { formatLocalItemCount } from '../../lib/mediaIntelligence/libraryDisplayUtils';
import { useI18n } from '../../i18n/I18nProvider';

interface LibraryPageHeaderProps {
  page: LibraryPage;
  contentMode?: ContentMode;
  query: string;
  selectedTitle?: LibraryTitle;
  selectedFranchise?: FranchiseCatalogEntry;
  selectedCatalog?: CatalogTitle;
  homeSubtitle: string;
}

export const LibraryPageHeader = memo(function LibraryPageHeader(props: LibraryPageHeaderProps) {
  const { t } = useI18n();
  const { page, selectedTitle, selectedFranchise } = props;

  if (page === 'files') {
    return (
      <>
        <p className="eyebrow">{t('media.commandCenter')}</p>
        <h2>{t('media.headline')}</h2>
      </>
    );
  }

  if (page === 'title' && selectedTitle) {
    const kindKey = selectedTitle.mediaType === 'unknown' ? 'group' : selectedTitle.mediaType;
    const countLabel = formatLocalItemCount(selectedTitle, t);
    return (
      <>
        <p className="eyebrow">{t(`media.titles.kind.${kindKey}`)}</p>
        <h2 className="main-header__collection-title">{selectedTitle.displayTitle}</h2>
        <p className="main-header__subtitle muted">
          {[
            t(`media.titles.kind.${kindKey}`),
            selectedTitle.year,
            t('media.library.statusInLibrary'),
            countLabel,
          ].filter(Boolean).join(' · ')}
        </p>
      </>
    );
  }

  if (page === 'franchise' && selectedFranchise) {
    return (
      <>
        <p className="eyebrow">{t('media.franchise.hubLabel')}</p>
        <h2 className="main-header__collection-title">{selectedFranchise.franchiseName}</h2>
        {selectedFranchise.description && (
          <p className="main-header__subtitle muted">{selectedFranchise.description}</p>
        )}
      </>
    );
  }

  if (page === 'catalog' && props.selectedCatalog) {
    return (
      <>
        <p className="eyebrow">{props.selectedCatalog.type.toUpperCase()}</p>
        <h2 className="main-header__collection-title">{props.selectedCatalog.title}</h2>
        <p className="main-header__subtitle muted">
          {[props.selectedCatalog.year, props.selectedCatalog.franchiseName].filter(Boolean).join(' · ')}
        </p>
      </>
    );
  }

  if (page === 'downloads') {
    return null;
  }

  if (page === 'watchlist') {
    return (
      <>
        <p className="eyebrow">{t('nav.workspace.watchlist')}</p>
        <h2 className="main-header__collection-title">{t('watchlist.title')}</h2>
        <p className="main-header__subtitle muted">{t('watchlist.subtitle')}</p>
      </>
    );
  }

  if (page === 'discover') {
    return (
      <>
        <p className="eyebrow">{t('discover.eyebrow')}</p>
        <h2 className="main-header__collection-title">{t('discover.title')}</h2>
        <p className="main-header__subtitle muted">{t('discover.subtitle')}</p>
      </>
    );
  }

  if (page === 'search') {
    return (
      <h2 className="main-header__collection-title">
        {t('media.search.resultsFor', { query: props.query.trim() })}
      </h2>
    );
  }

  if (page === 'home' && props.contentMode === 'music') {
    return (
      <>
        <h2 className="main-header__collection-title">{t('contentMode.musicHeading')}</h2>
        <p className="main-header__subtitle muted">{props.homeSubtitle}</p>
      </>
    );
  }

  return (
    <>
      <h2 className="main-header__collection-title">{t('media.titles.cinemaHeading')}</h2>
      <p className="main-header__subtitle muted">{props.homeSubtitle}</p>
    </>
  );
});
