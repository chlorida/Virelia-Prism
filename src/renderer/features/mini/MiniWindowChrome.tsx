import { memo } from 'react';
import { useI18n } from '../../i18n/I18nProvider';

interface MiniWindowChromeProps {
  onRestore: () => void;
  onClose: () => void;
}

export const MiniWindowChrome = memo(function MiniWindowChrome(props: MiniWindowChromeProps) {
  const { t } = useI18n();

  return (
    <header className="mini-window-chrome">
      <div className="mini-window-chrome__drag" data-tauri-drag-region>
        <span className="mini-window-chrome__mark" aria-hidden>VP</span>
        <span className="mini-window-chrome__label">{t('player.mini')}</span>
      </div>
      <div className="mini-window-chrome__actions">
        <button type="button" className="mini-window-chrome__btn" onClick={props.onRestore}>
          {t('player.restoreWindow')}
        </button>
        <button
          type="button"
          className="mini-window-chrome__icon mini-window-chrome__icon--close"
          aria-label={t('player.closeMini')}
          title={t('player.closeMini')}
          onClick={props.onClose}
        >
          <span aria-hidden>×</span>
        </button>
      </div>
    </header>
  );
});
