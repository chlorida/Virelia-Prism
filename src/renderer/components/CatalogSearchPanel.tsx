import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { LibraryTitle } from '../lib/mediaIntelligence/types';
import type { MediaItem } from '../../shared/types';
import { useI18n } from '../i18n/I18nProvider';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  abortCatalogSearch,
  runCatalogSearch,
  type CatalogSearchScope,
} from '../lib/metadata/catalogSearchService';
import { MediaDiscoveryCard } from './library/MediaDiscoveryCard';
import { PlaceholderPoster } from './library/PlaceholderPoster';
import { resolveCardPrimaryAction } from '../lib/metadata/recommendationService';
import { resolveTitlePlayTarget } from '../lib/mediaIntelligence/titlePlaybackService';
import { playUiSound } from '../services/uiAudioService';
import type { MetadataSearchResult } from '../lib/metadata/types';
import { getCardImage, markImageUrlFailed } from '../lib/metadata/imageResolver';
import { pingMetadataGateway } from '../lib/metadata/prismMetadataGatewayProvider';
import { parseCatalogRef } from '../lib/metadata/catalogRef';
import type { TranslationKey } from '../../shared/i18n';
import { useAppShell } from '../app/AppShellContext';
import { requestExternalSearch } from '../services/externalSearchService';

export type SearchTab = 'all' | 'library' | 'metadata' | 'franchises' | 'people' | 'files';

const TAB_TO_SCOPE: Record<SearchTab, CatalogSearchScope> = {
  all: 'all',
  library: 'library',
  metadata: 'online',
  franchises: 'franchises',
  people: 'people',
  files: 'files',
};

interface CatalogSearchPanelProps {
  query: string;
  tab: SearchTab;
  libraryTitles: LibraryTitle[];
  mediaItems: MediaItem[];
  variant?: 'palette' | 'page';
  onClearSearch?: () => void;
  onOpenTitle: (titleId: string) => void;
  onOpenCatalog: (catalogRef: string) => void;
  onPlayTitle: (title: LibraryTitle) => void;
  onOpenFranchise: (franchiseId: string) => void;
}

function isFranchiseResult(item: MetadataSearchResult): boolean {
  const { provider } = parseCatalogRef(item.catalogId);
  return provider === 'franchise-catalog';
}

function SearchResultRow(props: {
  title: string;
  subtitle?: string;
  meta?: string;
  badge: string;
  posterUrl?: string;
  type?: string;
  year?: number;
  onOpen: () => void;
  onPrimary?: () => void;
  primaryLabel?: string;
  showPrimary?: boolean;
}) {
  return (
    <article className="search-result-row">
      <button type="button" className="search-result-row__open" onClick={props.onOpen}>
        <div className="search-result-row__poster">
          {props.posterUrl ? (
            <img
              src={props.posterUrl}
              alt=""
              loading="lazy"
              onError={(event) => {
                markImageUrlFailed(event.currentTarget.src);
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <PlaceholderPoster title={props.title} type={props.type} year={props.year} badge={props.badge} />
          )}
        </div>
        <div className="search-result-row__body">
          <span className="search-result-row__badge">{props.badge}</span>
          <strong className="search-result-row__title">{props.title}</strong>
          {props.subtitle && <p className="search-result-row__subtitle muted">{props.subtitle}</p>}
          {props.meta && <p className="search-result-row__meta muted">{props.meta}</p>}
        </div>
      </button>
      {props.showPrimary && props.onPrimary && (
        <button type="button" className="ghost-button pill-button--compact" onClick={props.onPrimary}>
          {props.primaryLabel}
        </button>
      )}
    </article>
  );
}

function SearchEmpty(props: { title: string; detail?: string; children?: React.ReactNode }) {
  return (
    <div className="search-state-empty">
      <p>{props.title}</p>
      {props.detail && <p className="muted">{props.detail}</p>}
      {props.children}
    </div>
  );
}

function SearchEmptyActions(props: {
  onRetry?: () => void;
  retrying?: boolean;
  onSearchWeb?: () => void;
  onClear?: () => void;
  t: (key: TranslationKey) => string;
}) {
  if (!props.onRetry && !props.onSearchWeb && !props.onClear) return null;
  return (
    <div className="search-state-empty__actions">
      {props.onRetry && (
        <button type="button" className="ghost-button" disabled={props.retrying} onClick={props.onRetry}>
          {props.t('search.retryCatalog')}
        </button>
      )}
      {props.onSearchWeb && (
        <button type="button" className="ghost-button" onClick={props.onSearchWeb}>
          {props.t('search.searchWeb')}
        </button>
      )}
      {props.onClear && (
        <button type="button" className="ghost-button" onClick={props.onClear}>
          {props.t('search.clear')}
        </button>
      )}
    </div>
  );
}

function SearchLoading(props: { message: string }) {
  return (
    <div className="search-state-loading" role="status">
      <span className="search-state-loading__spinner" aria-hidden />
      <p>{props.message}</p>
    </div>
  );
}

export const CatalogSearchPanel = memo(function CatalogSearchPanel(props: CatalogSearchPanelProps) {
  const { t } = useI18n();
  const shell = useAppShell();
  const debouncedQuery = useDebouncedValue(props.query, 400);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Awaited<ReturnType<typeof runCatalogSearch>> | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      abortCatalogSearch();
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void runCatalogSearch({
      query: trimmed,
      scope: TAB_TO_SCOPE[props.tab],
      libraryTitles: props.libraryTitles,
      mediaItems: props.mediaItems,
    }).then((response) => {
      if (cancelled) return;
      setResults(response);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      abortCatalogSearch();
    };
  }, [debouncedQuery, props.tab, props.libraryTitles, props.mediaItems]);

  const handleRetryGateway = useCallback(async () => {
    setRetrying(true);
    await pingMetadataGateway();
    const trimmed = debouncedQuery.trim();
    if (trimmed) {
      const response = await runCatalogSearch({
        query: trimmed,
        scope: TAB_TO_SCOPE[props.tab],
        libraryTitles: props.libraryTitles,
        mediaItems: props.mediaItems,
      });
      setResults(response);
    }
    setRetrying(false);
  }, [debouncedQuery, props.tab, props.libraryTitles, props.mediaItems]);

  const franchiseOnline = results?.online.filter(isFranchiseResult) ?? [];
  const catalogOnline = results?.online.filter((item) => !isFranchiseResult(item)) ?? [];

  const topResults = useMemo(() => {
    if (!results || props.tab !== 'all') return [];
    const picks: Array<{ key: string; score: number; node: React.ReactNode }> = [];

    for (const hit of results.local.local.slice(0, 4)) {
      const title = hit.title;
      const primary = resolveCardPrimaryAction({
        localTitleId: title.id,
        title: title.displayTitle,
        year: title.year,
        type: (title.mediaType === 'unknown' ? 'movie' : title.mediaType) as MetadataSearchResult['type'],
        localAvailability: 'in_library',
        reason: '',
        reasonKey: 'discover.reason.fromLibrary',
        score: 0,
      }, title, t);
      picks.push({
        key: `local-${title.id}`,
        score: 100,
        node: (
          <SearchResultRow
            key={`top-${title.id}`}
            title={title.displayTitle}
            meta={[title.year, title.mediaType].filter(Boolean).join(' · ')}
            badge={t('search.badge.inLibrary')}
            posterUrl={getCardImage({ localTitle: title, titleLabel: title.displayTitle }).url}
            type={title.mediaType}
            year={title.year}
            primaryLabel={primary.label}
            showPrimary={primary.playable}
            onOpen={() => props.onOpenTitle(title.id)}
            onPrimary={() => { if (resolveTitlePlayTarget(title)) props.onPlayTitle(title); }}
          />
        ),
      });
    }

    for (const item of catalogOnline.slice(0, 4)) {
      const localMatch = props.libraryTitles.find((lt) => lt.displayTitle.toLowerCase() === item.title.toLowerCase());
      picks.push({
        key: item.catalogId,
        score: item.confidence * 80,
        node: (
          <SearchResultRow
            key={`top-${item.catalogId}`}
            title={item.title}
            subtitle={item.originalTitle}
            meta={[item.type, item.year].filter(Boolean).join(' · ')}
            badge={localMatch ? t('search.badge.inLibrary') : t('search.badge.onlineCatalog')}
            posterUrl={getCardImage({ searchResult: item, localTitle: localMatch, titleLabel: item.title }).url ?? item.posterUrl}
            type={item.type}
            year={item.year}
            onOpen={() => { playUiSound('open'); props.onOpenCatalog(item.catalogId); }}
          />
        ),
      });
    }

    return picks.sort((a, b) => b.score - a.score).slice(0, 5);
  }, [results, props.tab, catalogOnline, props.libraryTitles, t, props]);

  const handleSearchWeb = () => {
    void requestExternalSearch(debouncedQuery.trim(), undefined, shell.settings);
  };

  if (!debouncedQuery.trim()) {
    return <SearchEmpty title={t('search.empty.prompt')} />;
  }

  const loadingMessage = (() => {
    if (props.tab === 'library') return t('search.loadingLibrary');
    if (props.tab === 'metadata' || props.tab === 'franchises') return t('search.loadingOnline');
    if (props.tab === 'people') return t('search.loadingPeople');
    if (props.tab === 'files') return t('search.loadingFiles');
    return t('search.loadingAll');
  })();

  if (loading && !results) {
    return <SearchLoading message={loadingMessage} />;
  }

  if (!results) return null;

  if (results.error) {
    return (
      <SearchEmpty title={t('search.error')} detail={results.error}>
        <SearchEmptyActions
          t={t}
          retrying={retrying}
          onRetry={() => void handleRetryGateway()}
          onSearchWeb={() => void requestExternalSearch(results.query, undefined, shell.settings)}
          onClear={props.onClearSearch}
        />
      </SearchEmpty>
    );
  }

  const hasLocal = results.local.hasResults;
  const hasCatalogOnline = catalogOnline.length > 0;
  const hasFranchises = franchiseOnline.length > 0;
  const hasPeople = results.people.length > 0;
  const hasFiles = results.files.length > 0;
  const hasAny = hasLocal || hasCatalogOnline || hasFranchises || hasPeople || hasFiles;

  const gatewayLimited = results.gatewayStatus !== 'available'
    && results.onlineEnabled
    && results.onlineAvailable
    && hasCatalogOnline;
  const gatewayDown = results.onlineEnabled && !results.onlineAvailable;

  const emptyActions = (
    <SearchEmptyActions
      t={t}
      retrying={retrying}
      onRetry={() => void handleRetryGateway()}
      onSearchWeb={handleSearchWeb}
      onClear={props.onClearSearch}
    />
  );

  const renderOnlineWarning = () => {
    if (!results.onlineEnabled || props.tab === 'library' || props.tab === 'files') return null;
    if (gatewayDown && hasLocal) {
      return (
        <div className="search-warning-banner" role="status">
          <p>{t('search.onlineUnavailable')}</p>
          <p className="muted">{t('search.showingLocalOnly')}</p>
        </div>
      );
    }
    if (gatewayDown) return null;
    if (gatewayLimited) {
      return (
        <div className="search-warning-banner search-warning-banner--limited" role="status">
          <p>{t('search.onlineLimited')}</p>
        </div>
      );
    }
    return null;
  };

  const renderEmptyForTab = () => {
    switch (props.tab) {
      case 'library':
        return (
          <SearchEmpty title={t('search.noLocalResults', { query: results.query })}>
            {emptyActions}
          </SearchEmpty>
        );
      case 'metadata':
        if (gatewayDown) {
          return (
            <SearchEmpty title={t('search.onlineUnavailable')} detail={t('search.noOnlineResultsFromSources')}>
              {emptyActions}
            </SearchEmpty>
          );
        }
        return (
          <SearchEmpty title={t('search.noOnlineResults', { query: results.query })}>
            {emptyActions}
          </SearchEmpty>
        );
      case 'franchises':
        return (
          <SearchEmpty title={t('search.noFranchiseResults', { query: results.query })}>
            {emptyActions}
          </SearchEmpty>
        );
      case 'people':
        return (
          <SearchEmpty title={t('search.noPeopleResults', { query: results.query })}>
            {emptyActions}
          </SearchEmpty>
        );
      case 'files':
        return (
          <SearchEmpty title={t('search.noFilesResults', { query: results.query })}>
            {emptyActions}
          </SearchEmpty>
        );
      default:
        if (gatewayDown) {
          return (
            <SearchEmpty
              title={t('search.onlineUnavailable')}
              detail={t('search.onlineUnavailableNoLocal')}
            >
              {emptyActions}
            </SearchEmpty>
          );
        }
        return (
          <SearchEmpty
            title={t('search.noResultsAll', { query: results.query })}
            detail={t('search.noResultsAllDetail')}
          >
            {emptyActions}
          </SearchEmpty>
        );
    }
  };

  if (!hasAny) {
    return (
      <>
        {renderOnlineWarning()}
        {renderEmptyForTab()}
      </>
    );
  }

  const renderOnlineRows = (items: MetadataSearchResult[]) => (
    <div className="catalog-search-panel__list">
      {items.map((item) => {
        const localMatch = props.libraryTitles.find((title) => title.displayTitle.toLowerCase() === item.title.toLowerCase());
        const rec = {
          catalogId: item.catalogId,
          localTitleId: localMatch?.id,
          title: item.title,
          year: item.year,
          type: item.type,
          posterUrl: item.posterUrl,
          localAvailability: localMatch ? 'in_library' as const : 'metadata_only' as const,
          reason: item.provider,
          reasonKey: 'discover.reason.metadataOnly' as TranslationKey,
          score: item.confidence,
        };
        const primary = resolveCardPrimaryAction(rec, localMatch, t);
        const poster = getCardImage({ searchResult: item, localTitle: localMatch, titleLabel: item.title }).url ?? item.posterUrl;
        return (
          <SearchResultRow
            key={item.catalogId}
            title={item.title}
            subtitle={item.originalTitle}
            meta={[item.type, item.year, item.provider].filter(Boolean).join(' · ')}
            badge={localMatch ? t('search.badge.inLibrary') : t('search.badge.onlineCatalog')}
            posterUrl={poster}
            type={item.type}
            year={item.year}
            primaryLabel={primary.label}
            showPrimary={primary.playable}
            onOpen={() => { playUiSound('open'); props.onOpenCatalog(item.catalogId); }}
            onPrimary={() => {
              if (primary.playable && localMatch) props.onPlayTitle(localMatch);
              else props.onOpenCatalog(item.catalogId);
            }}
          />
        );
      })}
    </div>
  );

  const showLocal = props.tab === 'all' || props.tab === 'library';
  const showOnline = props.tab === 'all' || props.tab === 'metadata';
  const showFranchises = props.tab === 'all' || props.tab === 'franchises';
  const showPeople = props.tab === 'all' || props.tab === 'people';
  const showFiles = props.tab === 'all' || props.tab === 'files';

  return (
    <div className="catalog-search-panel">
      {loading && results && (
        <p className="search-state-inline muted" role="status">{loadingMessage}</p>
      )}
      {renderOnlineWarning()}

      {props.tab === 'all' && topResults.length > 0 && (
        <section className="catalog-search-panel__section">
          <h3>{t('search.section.topResults')}</h3>
          <div className="catalog-search-panel__list">{topResults.map((item) => item.node)}</div>
        </section>
      )}

      {showLocal && hasLocal && (
        <section className="catalog-search-panel__section">
          <h3>{t('search.section.fromLibrary')}</h3>
          <div className="discover-row discover-row--compact">
            {results.local.local.map((hit) => {
              const title = hit.title;
              const rec = {
                localTitleId: title.id,
                title: title.displayTitle,
                year: title.year,
                type: (title.mediaType === 'unknown' ? 'movie' : title.mediaType) as MetadataSearchResult['type'],
                localAvailability: 'in_library' as const,
                reason: '',
                reasonKey: 'discover.reason.fromLibrary',
                score: 0,
              };
              const primary = resolveCardPrimaryAction(rec, title, t);
              return (
                <MediaDiscoveryCard
                  key={hit.episode ? `${title.id}:${hit.episode.id}` : title.id}
                  item={rec}
                  localTitle={title}
                  compact
                  primaryLabel={primary.label}
                  showPrimaryAction={primary.playable}
                  onOpen={() => props.onOpenTitle(title.id)}
                  onPrimaryAction={() => {
                    if (resolveTitlePlayTarget(title)) props.onPlayTitle(title);
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      {showOnline && hasCatalogOnline && (
        <section className="catalog-search-panel__section">
          <h3>{t('search.section.onlineCatalog')}</h3>
          {renderOnlineRows(catalogOnline)}
        </section>
      )}

      {showFranchises && hasFranchises && (
        <section className="catalog-search-panel__section">
          <h3>{t('search.tab.franchises')}</h3>
          {renderOnlineRows(franchiseOnline)}
        </section>
      )}

      {showPeople && hasPeople && (
        <section className="catalog-search-panel__section">
          <h3>{t('search.tab.people')}</h3>
          <div className="catalog-search-panel__list">
            {results.people.map((person) => (
              <SearchResultRow
                key={person.personId}
                title={person.name}
                meta={person.knownFor?.slice(0, 3).join(' · ')}
                badge={t('search.badge.person')}
                posterUrl={person.photoUrl}
                onOpen={() => {}}
              />
            ))}
          </div>
        </section>
      )}

      {showFiles && hasFiles && (
        <section className="catalog-search-panel__section">
          <h3>{t('search.tab.files')}</h3>
          <div className="catalog-search-panel__list">
            {results.files.map((file) => (
              <SearchResultRow
                key={file.id}
                title={file.title || file.fileName}
                meta={file.folderLabel ?? file.folder}
                badge={t('search.badge.file')}
                onOpen={() => {}}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
});
