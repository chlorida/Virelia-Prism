import { memo } from 'react';

import { useI18n } from '../../i18n/I18nProvider';
import { useStore } from '../../lib/useStore';
import { libraryRouterStore } from '../../features/library/libraryRouterStore';
import { watchlistStore } from '../../features/library/watchlistStore';
import {
  downloadStore,
  selectActiveDownloads,
} from '../../features/downloads/downloadStore';
import type { WorkspacePrimary } from './LibraryWorkspaceNav';
interface LibrarySidebarContextProps {
  primary: WorkspacePrimary;
}

export const LibrarySidebarContext = memo(function LibrarySidebarContext(props: LibrarySidebarContextProps) {
  const { t } = useI18n();
  const route = useStore(libraryRouterStore, (state) => state.route);
  const watchlistCount = useStore(watchlistStore, (state) => state.items.length);
  const activeDownloads = useStore(downloadStore, selectActiveDownloads);

  if (route.page === 'downloads') {
    return (
      <section className="library-sidebar-context" aria-label={t('downloads.sidebar.aria')}>
        <p className="library-sidebar-context__title">{t('downloads.title')}</p>
        <p className="library-sidebar-context__stat">
          {activeDownloads.length > 0
            ? t('downloads.sidebar.progress', {
                percent: Math.round(
                  activeDownloads.reduce((sum, item) => sum + item.progress, 0)
                  / Math.max(1, activeDownloads.length)
                  * 100
                ),
                count: activeDownloads.length,
              })
            : t('downloads.sidebar.hint')}
        </p>
        <p className="library-sidebar-context__hint muted">{t('downloads.sidebar.context')}</p>
      </section>
    );
  }

  if (props.primary === 'discover') {
    return (
      <section className="library-sidebar-context" aria-label={t('sidebar.discover.aria')}>
        <p className="library-sidebar-context__title">{t('nav.workspace.discover')}</p>
        <p className="library-sidebar-context__hint muted">{t('sidebar.discover.hint')}</p>
      </section>
    );
  }

  if (props.primary === 'watchlist') {
    return (
      <section className="library-sidebar-context" aria-label={t('sidebar.watchlist.aria')}>
        <p className="library-sidebar-context__title">{t('nav.workspace.watchlist')}</p>
        <p className="library-sidebar-context__stat">
          {t('sidebar.watchlist.count', { count: watchlistCount })}
        </p>
        <p className="library-sidebar-context__hint muted">{t('sidebar.watchlist.hint')}</p>
      </section>
    );
  }

  return null;
});
