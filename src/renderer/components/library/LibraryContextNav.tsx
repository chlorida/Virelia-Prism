import { memo } from 'react';
import { useI18n } from '../../i18n/I18nProvider';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface LibraryContextNavProps {
  backLabel?: string;
  onBack?: () => void;
  breadcrumbs?: BreadcrumbItem[];
}

export const LibraryContextNav = memo(function LibraryContextNav(props: LibraryContextNavProps) {
  const { t } = useI18n();

  if (!props.onBack && (!props.breadcrumbs || props.breadcrumbs.length === 0)) {
    return null;
  }

  return (
    <nav className="library-context-nav" aria-label={t('media.library.navigation')}>
      {props.onBack && (
        <button type="button" className="library-context-nav__back" onClick={props.onBack}>
          <span aria-hidden>←</span> {props.backLabel ?? t('media.franchise.back')}
        </button>
      )}
      {props.breadcrumbs && props.breadcrumbs.length > 0 && (
        <ol className="library-context-nav__crumbs">
          {props.breadcrumbs.map((crumb, index) => {
            const isLast = index === props.breadcrumbs!.length - 1;
            return (
              <li key={`${crumb.label}-${index}`} className="library-context-nav__crumb">
                {crumb.onClick && !isLast ? (
                  <button type="button" className="library-context-nav__crumb-btn" onClick={crumb.onClick}>
                    {crumb.label}
                  </button>
                ) : (
                  <span
                    className={isLast ? 'library-context-nav__crumb-current' : undefined}
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
});
