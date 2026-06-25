import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import type { CatalogTitleSearchHit, LocalTitleSearchHit, UnifiedLibrarySearchResults } from '../lib/mediaIntelligence/librarySearchService';
import type { FranchiseSearchResult } from '../lib/mediaIntelligence/franchise/franchiseService';
import { runUnifiedLibrarySearch } from '../lib/mediaIntelligence/librarySearchService';
import { getTitleProgressSummary, resolveTitlePlayTarget } from '../lib/mediaIntelligence/titlePlaybackService';
import { formatDuration } from '../lib/search';
import { resolveLocalPlayLabel } from '../lib/mediaIntelligence/libraryDisplayUtils';
import { useI18n } from '../i18n/I18nProvider';
import { useAppShell } from '../app/AppShellContext';
import { FranchiseTitleCover } from './franchise/FranchiseTitleCover';
import { requestExternalSearch } from '../services/externalSearchService';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}


function highlightMatch(text: string, query: string): ReactNode {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const lower = trimmed.toLowerCase();
  const lowerText = text.toLowerCase();
  const index = lowerText.indexOf(lower);
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="library-search-highlight">{text.slice(index, index + trimmed.length)}</mark>
      {text.slice(index + trimmed.length)}
    </>
  );
}

export type SearchResultsFilterTab = 'all' | 'library' | 'metadata' | 'franchises';

interface LibrarySearchResultsProps {
  query: string;
  libraryTitles: LibraryTitle[];
  filterTab?: SearchResultsFilterTab;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onOpenTitle: (titleId: string) => void;
  onOpenCatalogTitle?: (catalogTitleId: string, franchiseId?: string) => void;
  onPlayTitle: (title: LibraryTitle, episodeItemId?: string) => void;
  onOpenFranchise: (franchiseId: string) => void;
  onClearSearch: () => void;
  onImportFolder?: () => void;
}

function SearchResultRow(props: {
  posterTitle: string;
  mediaType: string;
  localTitle?: LibraryTitle;
  posterUrl?: string;
  title: ReactNode;
  subtitle: string;
  badges: string[];
  sourceLabel?: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onRowClick: () => void;
  onPrimary: () => void;
  onSecondary?: () => void;
}) {
  return (
    <article
      className="library-search-row"
      role="button"
      tabIndex={0}
      onClick={props.onRowClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.onRowClick();
        }
      }}
    >
      <div className="library-search-row__poster">
        <FranchiseTitleCover
          title={props.posterTitle}
          mediaType={props.mediaType}
          posterUrl={props.posterUrl}
          localTitle={props.localTitle}
        />
      </div>
      <div className="library-search-row__body">
        <strong className="library-search-row__title">{props.title}</strong>
        <p className="library-search-row__subtitle muted">{props.subtitle}</p>
        {props.sourceLabel && (
          <span className="library-search-row__source">{props.sourceLabel}</span>
        )}
        <div className="library-search-row__badges">
          {props.badges.map((badge) => (
            <span key={badge} className="meta-chip meta-chip--compact">{badge}</span>
          ))}
        </div>
      </div>
      <div className="library-search-row__actions">
        <button
          type="button"
          className="ghost-button library-search-row__btn library-search-row__btn--primary"
          onClick={(event) => {
            event.stopPropagation();
            props.onPrimary();
          }}
        >
          {props.primaryLabel}
        </button>
        {props.secondaryLabel && (
          <button
            type="button"
            className="ghost-button library-search-row__btn"
            onClick={(event) => {
              event.stopPropagation();
              props.onSecondary?.();
            }}
          >
            {props.secondaryLabel}
          </button>
        )}
      </div>
    </article>
  );
}

function filterCatalogResults(
  catalog: CatalogTitleSearchHit[],
  franchises: FranchiseSearchResult[]
): CatalogTitleSearchHit[] {
  if (franchises.length === 0) return catalog;
  const franchiseTitleIds = new Set(
    franchises.flatMap((entry) => entry.franchise.titles.map((title) => title.catalogTitleId))
  );
  return catalog.filter((hit) => !franchiseTitleIds.has(hit.catalogTitle.catalogTitleId));
}

function SearchResultsBody(props: {
  results: UnifiedLibrarySearchResults;
  libraryTitles: LibraryTitle[];
  filterTab: SearchResultsFilterTab;
  onOpenTitle: (titleId: string) => void;
  onOpenCatalogTitle?: (catalogTitleId: string, franchiseId?: string) => void;
  onPlayTitle: (title: LibraryTitle, episodeItemId?: string) => void;
  onOpenFranchise: (franchiseId: string) => void;
  onClearSearch: () => void;
  onImportFolder?: () => void;
}) {
  const { t } = useI18n();
  const shell = useAppShell();
  const { results } = props;
  const filteredCatalog = useMemo(
    () => filterCatalogResults(results.catalog, results.franchises),
    [results.catalog, results.franchises]
  );

  const showLocal = props.filterTab === 'all' || props.filterTab === 'library';
  const showFranchises = props.filterTab === 'all' || props.filterTab === 'franchises';
  const showCatalog = props.filterTab === 'all' || props.filterTab === 'metadata';

  if (!results.hasResults) {
    return (
      <div className="library-search-empty">
        <div className="library-search-empty__art" aria-hidden />
        <p>{t('media.search.noResultsTitle', { query: results.query })}</p>
        <p className="muted">{t('media.search.noResultsDetail')}</p>
        <div className="library-search-empty__actions">
          <button
            type="button"
            className="pill-button pill-button--accent"
            onClick={() => void requestExternalSearch(results.query, undefined, shell.settings)}
          >
            {t('media.search.searchOnline')}
          </button>
          {props.onImportFolder && (
            <button type="button" className="ghost-button" onClick={props.onImportFolder}>
              {t('media.search.importFolder')}
            </button>
          )}
          <button type="button" className="ghost-button" onClick={props.onClearSearch}>
            {t('media.search.clearSearch')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {showLocal && results.local.length > 0 && (
        <section className="library-search-section">
          <h3 className="library-search-section__heading">{t('media.search.localMatches')}</h3>
          <div className="library-search-section__list">
            {results.local.map((hit: LocalTitleSearchHit) => {
              const displayTitle = hit.episode
                ? `${hit.title.displayTitle} — ${hit.episode.displayTitle}`
                : hit.title.displayTitle;
              const progress = getTitleProgressSummary(hit.title);
              const primaryLabel = progress.continueItem
                ? t('media.titles.continueWatching')
                : resolveLocalPlayLabel(hit.title, t);
              const duration = hit.episode?.durationSeconds;
              const durationText = duration ? formatDuration(duration) : '';
              return (
                <SearchResultRow
                  key={hit.episode ? `${hit.title.id}:${hit.episode.id}` : hit.title.id}
                  posterTitle={displayTitle}
                  mediaType={hit.episode ? 'episode' : hit.title.mediaType}
                  localTitle={hit.title}
                  title={highlightMatch(displayTitle, results.query)}
                  subtitle={[
                    hit.episode ? t('media.library.sourceEpisode') : t(`media.titles.kind.${hit.title.mediaType === 'unknown' ? 'group' : hit.title.mediaType}`),
                    durationText,
                  ].filter(Boolean).join(' · ')}
                  sourceLabel={t('media.library.sourceLocal')}
                  badges={[t('media.library.statusInLibrary')]}
                  primaryLabel={primaryLabel}
                  secondaryLabel={t('media.search.openDetails')}
                  onRowClick={() => props.onOpenTitle(hit.title.id)}
                  onPrimary={() => {
                    const episodeItemId = hit.episode?.preferredItemId ?? hit.episode?.versions[0]?.itemId;
                    const target = resolveTitlePlayTarget(hit.title, episodeItemId);
                    if (target) props.onPlayTitle(hit.title, episodeItemId);
                    else props.onOpenTitle(hit.title.id);
                  }}
                  onSecondary={() => props.onOpenTitle(hit.title.id)}
                />
              );
            })}
          </div>
        </section>
      )}

      {showFranchises && results.franchises.length > 0 && (
        <section className="library-search-section">
          <h3 className="library-search-section__heading">{t('media.franchise.searchSection')}</h3>
          <div className="library-search-section__list">
            {results.franchises.map((result: FranchiseSearchResult) => (
              <SearchResultRow
                key={result.franchise.franchiseId}
                posterTitle={result.franchise.franchiseName}
                mediaType="series"
                posterUrl={result.franchise.posterUrl}
                localTitle={props.libraryTitles.find((title) => title.franchiseId === result.franchise.franchiseId)}
                title={highlightMatch(result.franchise.franchiseName, results.query)}
                subtitle={[
                  result.franchise.description ?? '',
                  t('media.library.franchiseProgress', {
                    local: result.localMatchCount,
                    total: result.franchise.titles.length,
                  }),
                ].filter(Boolean).join(' · ')}
                sourceLabel={t('media.library.sourceFranchise')}
                badges={[t('media.library.franchiseBadge')]}
                primaryLabel={t('media.franchise.openHub')}
                onRowClick={() => props.onOpenFranchise(result.franchise.franchiseId)}
                onPrimary={() => props.onOpenFranchise(result.franchise.franchiseId)}
              />
            ))}
          </div>
        </section>
      )}

      {showCatalog && filteredCatalog.length > 0 && (
        <section className="library-search-section">
          <h3 className="library-search-section__heading">{t('media.search.catalogMatches')}</h3>
          <div className="library-search-section__list">
            {filteredCatalog.map((hit: CatalogTitleSearchHit) => (
              <SearchResultRow
                key={hit.catalogTitle.catalogTitleId}
                posterTitle={hit.catalogTitle.displayTitle}
                mediaType={hit.catalogTitle.type}
                localTitle={hit.localTitleId
                  ? props.libraryTitles.find((title) => title.id === hit.localTitleId)
                  : undefined}
                title={highlightMatch(hit.catalogTitle.displayTitle, results.query)}
                subtitle={hit.franchiseName}
                sourceLabel={t('media.library.sourceCatalog')}
                badges={[
                  hit.catalogTitle.type.toUpperCase(),
                  hit.catalogTitle.releaseDate.slice(0, 4),
                  hit.inLibrary ? t('media.library.statusInLibrary') : t('media.library.statusNotInLibrary'),
                ].filter(Boolean)}
                primaryLabel={(() => {
                  if (!hit.inLibrary || !hit.localTitleId) return t('catalog.openDetails');
                  const local = props.libraryTitles.find((row) => row.id === hit.localTitleId);
                  return local ? resolveLocalPlayLabel(local, t) : t('catalog.openDetails');
                })()}
                secondaryLabel={t('media.search.openDetails')}
                onRowClick={() => {
                  if (hit.localTitleId) props.onOpenTitle(hit.localTitleId);
                  else props.onOpenCatalogTitle?.(hit.catalogTitle.catalogTitleId, hit.franchiseId);
                }}
                onPrimary={() => {
                  if (hit.localTitleId) {
                    const title = props.libraryTitles.find((row) => row.id === hit.localTitleId);
                    if (title) props.onPlayTitle(title);
                  } else {
                    props.onOpenCatalogTitle?.(hit.catalogTitle.catalogTitleId, hit.franchiseId);
                  }
                }}
                onSecondary={() => {
                  if (hit.localTitleId) props.onOpenTitle(hit.localTitleId);
                  else props.onOpenCatalogTitle?.(hit.catalogTitle.catalogTitleId, hit.franchiseId);
                }}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export const LibrarySearchResults = memo(function LibrarySearchResults(props: LibrarySearchResultsProps) {
  const debouncedQuery = useDebouncedValue(props.query, 150);
  const results = useMemo(
    () => runUnifiedLibrarySearch(debouncedQuery, props.libraryTitles),
    [debouncedQuery, props.libraryTitles]
  );

  const filterTab = props.filterTab ?? 'all';

  return (
    <div className="library-search-results">
      <SearchResultsBody
        results={results}
        libraryTitles={props.libraryTitles}
        filterTab={filterTab}
        onOpenTitle={props.onOpenTitle}
        onOpenCatalogTitle={props.onOpenCatalogTitle}
        onPlayTitle={props.onPlayTitle}
        onOpenFranchise={props.onOpenFranchise}
        onClearSearch={props.onClearSearch}
        onImportFolder={props.onImportFolder}
      />
    </div>
  );
});
