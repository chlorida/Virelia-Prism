import { memo } from 'react';

import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../../shared/i18n';

export type WorkspacePrimary = 'library' | 'discover' | 'watchlist';

export type LibrarySecondary = 'titles' | 'files';

interface LibraryWorkspaceNavProps {
  primary: WorkspacePrimary;
  librarySecondary?: LibrarySecondary;
  layout?: 'bar' | 'sidebar';
  collapsed?: boolean;
  labelsHidden?: boolean;
  searchSlot?: React.ReactNode;
  onPrimaryChange: (tab: WorkspacePrimary) => void;
  onLibrarySecondaryChange?: (tab: LibrarySecondary) => void;
}

const PRIMARY_TABS: WorkspacePrimary[] = ['library', 'discover', 'watchlist'];

const PRIMARY_ICONS: Record<WorkspacePrimary, string> = {
  library: '▣',
  discover: '✦',
  watchlist: '★',
};

const SECONDARY_ICONS: Record<LibrarySecondary, string> = {
  titles: '◎',
  files: '☰',
};

export const LibraryWorkspaceNav = memo(function LibraryWorkspaceNav(props: LibraryWorkspaceNavProps) {
  const { t } = useI18n();
  const layout = props.layout ?? 'bar';
  const collapsed = props.collapsed ?? false;
  const labelsHidden = props.labelsHidden ?? (layout === 'sidebar' && collapsed);
  const showLibrarySecondary = props.primary === 'library' && props.onLibrarySecondaryChange;

  const tabLabel = (key: TranslationKey) => t(key);

  return (
    <nav
      className={[
        'library-workspace-nav',
        layout === 'sidebar' ? 'library-workspace-nav--sidebar' : '',
        collapsed ? 'library-workspace-nav--collapsed' : '',
      ].filter(Boolean).join(' ')}
      aria-label={t('nav.workspace.label')}
    >
      <div className="library-workspace-nav__row">
        <div className="library-workspace-nav__primary" role="tablist">
          {PRIMARY_TABS.map((tab) => {
            const label = tabLabel(`nav.workspace.${tab}` as TranslationKey);
            return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={props.primary === tab}
              className={props.primary === tab ? 'library-workspace-nav__tab is-active' : 'library-workspace-nav__tab'}
              onClick={() => props.onPrimaryChange(tab)}
              title={labelsHidden ? label : undefined}
            >
              {layout === 'sidebar' && (
                <span className="library-workspace-nav__icon" aria-hidden>
                  {PRIMARY_ICONS[tab]}
                </span>
              )}
              <span
                className="library-workspace-nav__label"
                aria-hidden={labelsHidden || undefined}
              >
                {label}
              </span>
            </button>
            );
          })}
        </div>

        {props.searchSlot && (
          <div className="library-workspace-nav__search">
            {props.searchSlot}
          </div>
        )}
      </div>

      {showLibrarySecondary && (
        <div className="library-workspace-nav__secondary" role="tablist" aria-label={t('nav.library.secondary')}>
          {(['titles', 'files'] as const).map((tab) => {
            const label = tabLabel(`nav.library.${tab}` as TranslationKey);
            return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={props.librarySecondary === tab}
              className={
                props.librarySecondary === tab
                  ? 'library-workspace-nav__subtab is-active'
                  : 'library-workspace-nav__subtab'
              }
              onClick={() => props.onLibrarySecondaryChange?.(tab)}
              title={labelsHidden ? label : undefined}
            >
              {layout === 'sidebar' && (
                <span className="library-workspace-nav__icon" aria-hidden>
                  {SECONDARY_ICONS[tab]}
                </span>
              )}
              <span
                className="library-workspace-nav__label"
                aria-hidden={labelsHidden || undefined}
              >
                {label}
              </span>
            </button>
            );
          })}
        </div>
      )}
    </nav>
  );
});
