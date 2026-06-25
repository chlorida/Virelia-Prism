import { memo } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { useStore } from '../lib/useStore';
import {
  cancelExternalSearch,
  confirmExternalSearch,
  externalSearchStore,
} from '../services/externalSearchService';
import { useState } from 'react';
import { ModalAnimatedPresence } from './AnimatedPresence';
import { PrismToggle } from './PrismToggle';

export const ExternalSearchModalHost = memo(function ExternalSearchModalHost() {
  const { t } = useI18n();
  const state = useStore(externalSearchStore, (s) => s);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <ModalAnimatedPresence
      open={state.open}
      role="presentation"
      onBackdropClick={() => cancelExternalSearch()}
      panelClassName="modal-card browser-warning-modal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-search-title"
      >
        <h3 id="external-search-title">{t('catalog.browserWarning.title')}</h3>
        <p>{t('catalog.browserWarning.body')}</p>
        <div className="browser-warning-modal__remember">
          <PrismToggle
            checked={dontShowAgain}
            onCheckedChange={setDontShowAgain}
            aria-label={t('catalog.browserWarning.dontShowAgain')}
          />
          <span>{t('catalog.browserWarning.dontShowAgain')}</span>
        </div>
        <div className="modal-card__actions">
          <button type="button" className="ghost-button" onClick={() => cancelExternalSearch()}>
            {t('catalog.browserWarning.cancel')}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              confirmExternalSearch(dontShowAgain);
              setDontShowAgain(false);
            }}
          >
            {t('catalog.browserWarning.confirm')}
          </button>
        </div>
      </div>
    </ModalAnimatedPresence>
  );
});
