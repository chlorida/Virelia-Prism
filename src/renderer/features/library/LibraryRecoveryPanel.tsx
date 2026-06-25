import { memo } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { copyLibraryBootDiagnostics } from './libraryBootLog';
import { isTauriShell } from '../../lib/prismAdapter';
import { getLibraryBootPaths } from '../../lib/tauriCommands';

interface LibraryRecoveryPanelProps {
  bootError: string | null;
  onRetry: () => void;
  onRebuild: () => void;
  onOpenCache: () => void;
}

export const LibraryRecoveryPanel = memo(function LibraryRecoveryPanel(props: LibraryRecoveryPanelProps) {
  const { t } = useI18n();

  const copyDiagnostics = async () => {
    const text = copyLibraryBootDiagnostics();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const openCache = async () => {
    if (!isTauriShell()) return;
    try {
      const paths = await getLibraryBootPaths();
      props.onOpenCache();
      console.info('[Virelia] cache folder', paths.appDataDir);
    } catch {
      props.onOpenCache();
    }
  };

  return (
    <div className="library-recovery-panel glass-inset" role="alert">
      <h3>{t('library.recovery.title')}</h3>
      <p>{t('library.recovery.desc')}</p>
      {props.bootError && (
        <p className="library-recovery-panel__error">{props.bootError}</p>
      )}
      <div className="library-recovery-panel__actions">
        <button type="button" className="pill-button pill-button--accent" onClick={props.onRetry}>
          {t('library.recovery.retry')}
        </button>
        <button type="button" className="ghost-button" onClick={props.onRebuild}>
          {t('library.recovery.rebuild')}
        </button>
        <button type="button" className="ghost-button" onClick={openCache}>
          {t('library.recovery.openCache')}
        </button>
        <button type="button" className="ghost-button" onClick={copyDiagnostics}>
          {t('library.recovery.copyDiagnostics')}
        </button>
      </div>
    </div>
  );
});
