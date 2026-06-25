import { memo } from 'react';

import { useI18n } from '../../i18n/I18nProvider';
import { useStore } from '../../lib/useStore';
import { navigateToDownloads } from '../../features/library/libraryRouterStore';
import {
  downloadStore,
  selectActiveDownloads,
  selectAggregateDownloadProgress,
} from '../../features/downloads/downloadStore';
import { playUiSound } from '../../services/uiAudioService';
import { libraryRouterStore } from '../../features/library/libraryRouterStore';

interface DownloadActivityButtonProps {
  collapsed: boolean;
  peekExpanded: boolean;
}

const RING_RADIUS = 18;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const DownloadActivityButton = memo(function DownloadActivityButton(
  props: DownloadActivityButtonProps
) {
  const { t } = useI18n();
  const activeDownloads = useStore(downloadStore, selectActiveDownloads);
  const aggregateProgress = useStore(downloadStore, selectAggregateDownloadProgress);
  const onDownloadsPage = useStore(libraryRouterStore, (s) => s.route.page === 'downloads');
  const hasActive = activeDownloads.length > 0;
  const showExpanded = !props.collapsed || props.peekExpanded;
  const dashOffset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, aggregateProgress)));

  const handleClick = () => {
    playUiSound('open');
    navigateToDownloads();
  };

  return (
    <button
      type="button"
      className={[
        'download-activity-btn',
        hasActive ? 'download-activity-btn--active' : '',
        onDownloadsPage ? 'download-activity-btn--route' : '',
        !showExpanded ? 'download-activity-btn--collapsed' : '',
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      aria-label={
        hasActive
          ? t('downloads.sidebar.active', { percent: Math.round(aggregateProgress * 100) })
          : t('downloads.sidebar.idle')
      }
      title={
        hasActive
          ? t('downloads.sidebar.active', { percent: Math.round(aggregateProgress * 100) })
          : t('downloads.sidebar.idle')
      }
    >
      <span className="download-activity-btn__ring-wrap" aria-hidden>
        <svg className="download-activity-btn__ring" viewBox="0 0 44 44">
          <circle className="download-activity-btn__ring-track" cx="22" cy="22" r={RING_RADIUS} />
          <circle
            className="download-activity-btn__ring-progress"
            cx="22"
            cy="22"
            r={RING_RADIUS}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={hasActive ? dashOffset : RING_CIRCUMFERENCE}
          />
        </svg>
        <span className="download-activity-btn__icon" aria-hidden>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path
              d="M8 3.25v6.5M5.25 8 8 10.75 10.75 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4.25 12.75h7.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        {hasActive && <span className="download-activity-btn__pulse" />}
      </span>
      {showExpanded && (
        <span className="download-activity-btn__copy">
          <strong>{t('downloads.sidebar.label')}</strong>
          <small>
            {hasActive
              ? t('downloads.sidebar.progress', {
                  percent: Math.round(aggregateProgress * 100),
                  count: activeDownloads.length,
                })
              : t('downloads.sidebar.hint')}
          </small>
        </span>
      )}
    </button>
  );
});
