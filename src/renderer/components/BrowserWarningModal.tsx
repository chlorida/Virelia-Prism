import { memo } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { ModalAnimatedPresence } from './AnimatedPresence';

interface BrowserWarningModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const BrowserWarningModal = memo(function BrowserWarningModal(props: BrowserWarningModalProps) {
  const { t } = useI18n();

  return (
    <ModalAnimatedPresence
      open={props.open}
      role="dialog"
      aria-modal="true"
      onBackdropClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section className="settings-modal browser-warning-modal">
        <h2>{t('catalog.browserWarning.title')}</h2>
        <p>{t('catalog.browserWarning.body')}</p>
        <div className="browser-warning-modal__actions">
          <button type="button" className="ghost-button" onClick={props.onClose}>
            {t('catalog.browserWarning.cancel')}
          </button>
          <button type="button" className="primary-action" onClick={props.onConfirm}>
            {t('catalog.browserWarning.confirm')}
          </button>
        </div>
      </section>
    </ModalAnimatedPresence>
  );
});
