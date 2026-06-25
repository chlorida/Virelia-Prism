import { memo, useCallback, useEffect, useState } from 'react';
import type { LibraryTitle } from '../../lib/mediaIntelligence/types';
import type { MediaItem } from '../../../shared/types';
import { useI18n } from '../../i18n/I18nProvider';
import { useStore } from '../../lib/useStore';
import {
  closeSearchOverlay,
  openSearchOverlay,
  searchOverlayStore,
  setGlobalSearchQuery,
} from '../../features/library/searchOverlayStore';
import {
  navigateToCatalogTitle,
  navigateToFranchise,
  navigateToLocalTitle,
} from '../../features/library/libraryRouterStore';
import { CatalogSearchPanel, type SearchTab } from '../CatalogSearchPanel';
import { findLibraryTitleById } from '../../lib/mediaIntelligence/libraryTitleService';
import { resolveTitlePlayTarget } from '../../lib/mediaIntelligence/titlePlaybackService';
import { playUiSound } from '../../services/uiAudioService';
import { useAnimatedPresence } from '../../hooks/useAnimatedPresence';

const SEARCH_TABS: SearchTab[] = ['all', 'library', 'metadata', 'franchises', 'people', 'files'];

interface GlobalSearchOverlayProps {
  libraryTitles: LibraryTitle[];
  mediaItems: MediaItem[];
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onPlayTitle: (title: LibraryTitle, episodeItemId?: string) => void;
  onFocusRow: (id: string | undefined) => void;
  onClose: () => void;
}

export const GlobalSearchOverlay = memo(function GlobalSearchOverlay(props: GlobalSearchOverlayProps) {
  const { t } = useI18n();
  const open = useStore(searchOverlayStore, (s) => s.open);
  const query = useStore(searchOverlayStore, (s) => s.query);
  const [tab, setTab] = useState<SearchTab>('all');

  const handleClose = useCallback(() => {
    playUiSound('back');
    closeSearchOverlay();
    props.onClose();
  }, [props]);

  const handleClear = useCallback(() => {
    setGlobalSearchQuery('');
    props.searchInputRef.current?.focus();
  }, [props.searchInputRef]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
        props.searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleClose, props.searchInputRef]);

  const { shouldRender, phase, onAnimationEnd } = useAnimatedPresence({ visible: open, exitDurationMs: 220 });
  const backdropPhase = phase === 'enter' ? 'prism-animate-backdrop--enter' : phase === 'exit' ? 'prism-animate-backdrop--exit' : '';
  const panelPhase = phase === 'enter' ? 'prism-animate-panel--enter' : phase === 'exit' ? 'prism-animate-panel--exit' : '';

  if (!shouldRender) return null;

  return (
    <div className="search-palette" role="dialog" aria-modal="false" aria-label={t('search.overlay.label')} onAnimationEnd={onAnimationEnd}>
      <button type="button" className={`search-palette__backdrop ${backdropPhase}`.trim()} aria-label={t('settings.close')} onClick={handleClose} />
      <div className={`search-palette__panel search-palette__panel--animated ${panelPhase}`.trim()}>
        <header className="search-palette__header">
          <label className="search-palette__input-wrap">
            <span className="sr-only">{t('media.search')}</span>
            <input
              ref={props.searchInputRef}
              className="search-palette__input"
              value={query}
              autoFocus
              onChange={(event) => setGlobalSearchQuery(event.target.value)}
              placeholder={t('search.placeholder')}
            />
          </label>
          <button type="button" className="search-palette__close ghost-button" onClick={handleClose}>
            {t('settings.close')}
          </button>
          <span className="search-palette__hint muted">{t('search.overlay.escHint')}</span>
        </header>

        <div className="search-palette__tabs" role="tablist" aria-label={t('search.tabs.label')}>
          {SEARCH_TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'search-palette__tab is-active' : 'search-palette__tab'}
              onClick={() => setTab(id)}
            >
              {t(`search.tab.${id}`)}
            </button>
          ))}
        </div>

        <div className="search-palette__results">
          <CatalogSearchPanel
            query={query}
            tab={tab}
            libraryTitles={props.libraryTitles}
            mediaItems={props.mediaItems}
            variant="palette"
            onClearSearch={handleClear}
            onOpenTitle={(titleId) => {
              playUiSound('open');
              closeSearchOverlay();
              navigateToLocalTitle(titleId);
              const target = findLibraryTitleById(props.libraryTitles, titleId);
              const focus = target ? resolveTitlePlayTarget(target)?.item : undefined;
              if (focus) props.onFocusRow(focus.id);
            }}
            onOpenCatalog={(catalogTitleId) => {
              playUiSound('open');
              closeSearchOverlay();
              navigateToCatalogTitle(catalogTitleId);
            }}
            onPlayTitle={(title) => props.onPlayTitle(title)}
            onOpenFranchise={(franchiseId) => {
              playUiSound('open');
              closeSearchOverlay();
              navigateToFranchise(franchiseId);
            }}
          />
        </div>
      </div>
    </div>
  );
});

export function openGlobalSearch(query: string, searchInputRef?: React.RefObject<HTMLInputElement | null>): void {
  setGlobalSearchQuery(query);
  openSearchOverlay(query);
  requestAnimationFrame(() => searchInputRef?.current?.focus());
}
