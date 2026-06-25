import { memo, useMemo, useState } from 'react';
import { useAppShell } from '../../../app/AppShellContext';
import { useI18n } from '../../../i18n/I18nProvider';
import { LibraryContextNav } from '../../../components/library/LibraryContextNav';
import { CatalogTitleShelf } from '../../../components/library/CatalogTitleShelf';
import { navigatePrismBack, navigateToCatalogTitle } from '../libraryRouterStore';
import { playUiSound } from '../../../services/uiAudioService';
import { useStore } from '../../../lib/useStore';
import { filterCatalogResults } from '../../../lib/metadata/contentPolicyService';
import type { MetadataSearchResult, RecommendationItem } from '../../../lib/metadata/types';
import {
  removeFromWatchlist,
  updateWatchlistStatus,
  watchlistStore,
  type WatchlistItem,
  type WatchlistStatus,
} from '../watchlistStore';

interface WatchlistPageProps {
  onNavigateLibrary: () => void;
}

const FILTERS = ['all', 'interested', 'watching', 'completed', 'dropped'] as const;

function watchlistItemToSearchResult(item: WatchlistItem): MetadataSearchResult {
  return {
    catalogId: item.id,
    provider: item.provider,
    providerId: item.providerId,
    title: item.title,
    originalTitle: item.originalTitle,
    year: item.year,
    type: item.type,
    posterUrl: item.posterUrl,
    confidence: 0,
    source: 'watchlist',
  };
}

export const WatchlistPage = memo(function WatchlistPage(props: WatchlistPageProps) {
  const { t } = useI18n();
  const shell = useAppShell();
  const items = useStore(watchlistStore, (s) => s.items);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const includeAdultContent = shell.settings.discovery?.includeAdultContent ?? false;

  const filtered = useMemo(() => {
    const byStatus = filter === 'all' ? items : items.filter((item) => item.status === filter);
    if (includeAdultContent) return byStatus;
    const allowedIds = new Set(
      filterCatalogResults(byStatus.map(watchlistItemToSearchResult), false).map((item) => item.catalogId)
    );
    return byStatus.filter((item) => allowedIds.has(item.id));
  }, [items, filter, includeAdultContent]);

  const shelfItems = useMemo<RecommendationItem[]>(
    () => filtered.map((item) => ({
      catalogId: item.id,
      title: item.title,
      year: item.year,
      type: item.type,
      posterUrl: item.posterUrl,
      localAvailability: 'metadata_only',
      reason: item.status,
      reasonKey: 'discover.reason.metadataOnly',
      score: 0,
    })),
    [filtered]
  );

  const statusByCatalogId = useMemo(
    () => new Map(filtered.map((item) => [item.id, item.status])),
    [filtered]
  );

  const handleBack = () => {
    playUiSound('back');
    navigatePrismBack();
  };

  const openItem = (item: RecommendationItem) => {
    playUiSound('open');
    if (item.catalogId) navigateToCatalogTitle(item.catalogId);
  };

  return (
    <section className="watchlist-page title-media-grid">
      <LibraryContextNav
        onBack={handleBack}
        breadcrumbs={[
          { label: t('media.library.breadcrumbLibrary'), onClick: props.onNavigateLibrary },
          { label: t('nav.workspace.watchlist') },
        ]}
      />

      <div className="watchlist-page__filters">
        {FILTERS.map((id) => (
          <button
            key={id}
            type="button"
            className={filter === id ? 'shell-segment is-active' : 'shell-segment'}
            onClick={() => setFilter(id)}
          >
            {t(`watchlist.filter.${id}`)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="watchlist-page__empty glass-inset prism-empty-rise">
          <p>{t('watchlist.empty.title')}</p>
          <p className="muted">{t('watchlist.empty.detail')}</p>
        </div>
      ) : (
        <section className="watchlist-page__shelf library-browse-row">
        <CatalogTitleShelf
          listScopeKey={`watchlist-${filter}`}
          items={shelfItems}
          onOpenItem={openItem}
          renderCardFooter={(item) => {
            const catalogId = item.catalogId;
            if (!catalogId) return null;
            const status = statusByCatalogId.get(catalogId) ?? 'interested';
            return (
              <div className="watchlist-card-wrap__actions">
                <select
                  value={status}
                  onChange={(event) => updateWatchlistStatus(catalogId, event.target.value as WatchlistStatus)}
                  aria-label={item.title}
                >
                  {FILTERS.filter((f) => f !== 'all').map((entry) => (
                    <option key={entry} value={entry}>{t(`watchlist.status.${entry}`)}</option>
                  ))}
                </select>
                <button type="button" className="ghost-button" onClick={() => removeFromWatchlist(catalogId)}>
                  {t('watchlist.remove')}
                </button>
              </div>
            );
          }}
        />
        </section>
      )}
    </section>
  );
});
