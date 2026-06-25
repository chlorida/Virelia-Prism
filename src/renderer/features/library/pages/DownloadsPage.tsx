import { memo, useMemo, useState } from 'react';

import { useI18n } from '../../../i18n/I18nProvider';
import { useStore } from '../../../lib/useStore';
import { LibraryContextNav } from '../../../components/library/LibraryContextNav';
import { navigatePrismBack, navigateToLibraryHome } from '../libraryRouterStore';
import { playUiSound } from '../../../services/uiAudioService';
import {
  downloadStore,
  selectActiveDownloads,
  selectRecentDownloads,
} from '../../downloads/downloadStore';
import {
  cancelWhisperDownload,
  deleteWhisperModelFile,
  refreshInstalledWhisperModels,
  startWhisperModelDownloadInBackground,
} from '../../downloads/downloadService';
import {
  WHISPER_MODEL_META,
  whisperDownloadId,
  type DownloadItem,
} from '../../downloads/downloadTypes';
import type { WhisperModelSize } from '../../../../shared/subtitleTypes';
import { useEffect } from 'react';
import { getSettingsSnapshot, saveSettingsPatch, settingsStore } from '../../settings/settingsStore';

const CATALOG_MODELS: WhisperModelSize[] = ['base', 'small', 'medium', 'large-v3'];

function formatBytes(bytes: number | undefined, fallbackMb: number): string {
  if (bytes && Number.isFinite(bytes) && bytes > 0) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `~${fallbackMb} MB`;
}

function statusLabel(
  t: ReturnType<typeof useI18n>['t'],
  item: DownloadItem
): string {
  switch (item.status) {
    case 'queued':
      return t('downloads.status.queued');
    case 'starting':
      return t('downloads.status.starting');
    case 'downloading':
      return t('downloads.status.downloading', { percent: Math.round(item.progress * 100) });
    case 'complete':
      return t('downloads.status.complete');
    case 'cancelled':
      return t('downloads.status.cancelled');
    case 'failed':
      return t('downloads.status.failed');
    default:
      return '';
  }
}

interface DownloadCardProps {
  item: DownloadItem;
  variant: 'active' | 'history';
}

const DownloadCard = memo(function DownloadCard(props: DownloadCardProps) {
  const { t } = useI18n();
  const { item, variant } = props;
  const percent = Math.round(item.progress * 100);
  const meta = item.modelId ? WHISPER_MODEL_META[item.modelId as keyof typeof WHISPER_MODEL_META] : undefined;
  const isActive = variant === 'active';

  return (
    <article
      className={[
        'downloads-card',
        'glass-inset',
        isActive ? 'downloads-card--active' : '',
        item.status === 'failed' ? 'downloads-card--failed' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="downloads-card__glow" aria-hidden />
      <div className="downloads-card__head">
        <div className="downloads-card__badge">{item.kind === 'whisper-model' ? 'AI' : 'MEDIA'}</div>
        <div className="downloads-card__titles">
          <h3>{item.label}</h3>
          <p>{item.subtitle ?? meta?.detail ?? t('downloads.model.subtitle')}</p>
        </div>
        <span className="downloads-card__status">{statusLabel(t, item)}</span>
      </div>

      {isActive && (
        <div className="downloads-card__meter" aria-hidden>
          <div className="downloads-card__meter-fill" style={{ width: `${percent}%` }} />
          <div className="downloads-card__meter-shimmer" />
        </div>
      )}

      <div className="downloads-card__meta">
        <span>
          {formatBytes(item.downloadedBytes, meta?.sizeMb ?? 0)}
          {item.totalBytes ? ` / ${formatBytes(item.totalBytes, meta?.sizeMb ?? 0)}` : ''}
        </span>
        {item.error && <span className="downloads-card__error">{item.error}</span>}
      </div>

      <div className="downloads-card__actions">
        {isActive && item.modelId && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => void cancelWhisperDownload(item.modelId!)}
          >
            {t('downloads.action.cancel')}
          </button>
        )}
        {!isActive && item.modelId && item.status === 'failed' && (
          <button
            type="button"
            className="primary-action primary-action--shimmer"
            onClick={() => startWhisperModelDownloadInBackground(item.modelId!)}
          >
            <span>{t('downloads.action.retry')}</span>
          </button>
        )}
      </div>
    </article>
  );
});

interface WhisperModelCardProps {
  modelId: WhisperModelSize;
  installed: boolean;
  active: boolean;
  downloading: boolean;
}

const WhisperModelCard = memo(function WhisperModelCard(props: WhisperModelCardProps) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const meta = WHISPER_MODEL_META[props.modelId as keyof typeof WHISPER_MODEL_META];
  if (!meta) return null;

  async function handleUse() {
    playUiSound('confirm');
    const current = getSettingsSnapshot();
    await saveSettingsPatch({
      subtitles: {
        ...current.subtitles,
        whisperModel: props.modelId,
        transcriptionBackend: 'whisper-cpp',
      },
    });
  }

  async function handleDelete() {
    setError(null);
    try {
      playUiSound('warning');
      await deleteWhisperModelFile(props.modelId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.includes('bundled_model_cannot_delete')
        ? t('downloads.delete.bundled')
        : message);
    }
  }

  return (
    <article
      className={[
        'downloads-card',
        'glass-inset',
        props.installed ? 'downloads-card--installed' : '',
        props.active ? 'downloads-card--active-model' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="downloads-card__glow downloads-card__glow--installed" aria-hidden />
      <div className="downloads-card__head">
        <div className="downloads-card__badge downloads-card__badge--installed">
          {props.installed ? '✓' : 'AI'}
        </div>
        <div className="downloads-card__titles">
          <h3>{meta.label}</h3>
          <p>{meta.detail}</p>
        </div>
        <span className="downloads-card__status downloads-card__status--ready">
          {props.active
            ? t('downloads.action.active')
            : props.installed
              ? t('downloads.installed.ready')
              : t('downloads.status.queued')}
        </span>
      </div>
      <div className="downloads-card__meta">
        <span>{formatBytes(undefined, meta.sizeMb)}</span>
        {error && <span className="downloads-card__error">{error}</span>}
      </div>
      <div className="downloads-card__actions">
        {!props.installed && !props.downloading && (
          <button
            type="button"
            className="primary-action primary-action--shimmer"
            onClick={() => {
              playUiSound('open');
              startWhisperModelDownloadInBackground(props.modelId);
            }}
          >
            <span>{t('downloads.action.download')}</span>
          </button>
        )}
        {props.installed && !props.active && (
          <button type="button" className="ghost-button" onClick={() => void handleUse()}>
            {t('downloads.action.use')}
          </button>
        )}
        {props.installed && (
          <button type="button" className="ghost-button" onClick={() => void handleDelete()}>
            {t('downloads.action.delete')}
          </button>
        )}
      </div>
    </article>
  );
});

export const DownloadsPage = memo(function DownloadsPage() {
  const { t } = useI18n();
  const active = useStore(downloadStore, selectActiveDownloads);
  const history = useStore(downloadStore, selectRecentDownloads);
  const installed = useStore(downloadStore, (s) => s.installedWhisperModels);
  const settings = useStore(settingsStore, (s) => s.settings);
  const activeModel = settings?.subtitles.whisperModel ?? 'base';

  useEffect(() => {
    void refreshInstalledWhisperModels();
  }, []);

  const installedSet = useMemo(() => new Set(installed), [installed]);

  const downloadingModels = useMemo(() => {
    const ids = new Set<string>();
    for (const item of active) {
      if (item.modelId) ids.add(item.modelId);
    }
    return ids;
  }, [active]);

  const historyWithoutActive = useMemo(
    () => history.filter((item) => !active.some((a) => a.id === item.id)),
    [active, history]
  );

  const handleBack = () => {
    playUiSound('back');
    navigatePrismBack();
  };

  return (
    <div className="downloads-page">
      <div className="downloads-page__ambient" aria-hidden />
      <LibraryContextNav
        onBack={handleBack}
        breadcrumbs={[
          { label: t('media.library.breadcrumbLibrary'), onClick: () => navigateToLibraryHome() },
          { label: t('downloads.title') },
        ]}
      />

      <header className="downloads-page__hero">
        <p className="eyebrow">{t('downloads.eyebrow')}</p>
        <h1>{t('downloads.title')}</h1>
        <p className="downloads-page__hero-copy">{t('downloads.subtitle')}</p>
      </header>

      <div className="downloads-page__body">
        <section className="downloads-section">
          <header className="downloads-section__head">
            <h2>{t('downloads.section.active')}</h2>
            <p>{t('downloads.section.activeHint')}</p>
          </header>
          {active.length === 0 ? (
            <div className="downloads-empty glass-inset">
              <p>{t('downloads.empty.active')}</p>
            </div>
          ) : (
            <div className="downloads-grid">
              {active.map((item) => (
                <DownloadCard key={item.id} item={item} variant="active" />
              ))}
            </div>
          )}
        </section>

        <section className="downloads-section">
          <header className="downloads-section__head">
            <h2>{t('downloads.section.catalog')}</h2>
            <p>{t('downloads.section.catalogHint')}</p>
          </header>
          <div className="downloads-grid">
            {CATALOG_MODELS.map((modelId) => (
              <WhisperModelCard
                key={modelId}
                modelId={modelId}
                installed={installedSet.has(modelId)}
                active={activeModel === modelId}
                downloading={downloadingModels.has(modelId)}
              />
            ))}
          </div>
        </section>

        {historyWithoutActive.length > 0 && (
          <section className="downloads-section">
            <header className="downloads-section__head">
              <h2>{t('downloads.section.history')}</h2>
              <p>{t('downloads.section.historyHint')}</p>
            </header>
            <div className="downloads-grid">
              {historyWithoutActive.slice(0, 8).map((item) => (
                <DownloadCard key={`${item.id}-${item.completedAt}`} item={item} variant="history" />
              ))}
            </div>
          </section>
        )}

        <section className="downloads-section downloads-section--future glass-inset">
          <header className="downloads-section__head">
            <h2>{t('downloads.section.future')}</h2>
            <p>{t('downloads.section.futureHint')}</p>
          </header>
        </section>
      </div>
    </div>
  );
});
