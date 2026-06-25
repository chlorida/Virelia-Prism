import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { ModalAnimatedPresence } from './AnimatedPresence';

interface PromptModalProps {
  open: boolean;
  title: string;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
  inputKey?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

export function PromptModal(props: PromptModalProps) {
  const { t } = useI18n();
  const [value, setValue] = useState(props.defaultValue ?? '');

  useEffect(() => {
    if (!props.open) return;
    setValue(props.defaultValue ?? '');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props.open, props.defaultValue, props.onClose]);

  return (
    <ModalAnimatedPresence
      open={props.open}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-modal-title"
      onBackdropClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section className="settings-modal prompt-modal">
        <div className="modal-header">
          <div>
            <p className="eyebrow">{t('prompt.brand')}</p>
            <h2 id="prompt-modal-title">{props.title}</h2>
          </div>
          <button type="button" className="ghost-button" onClick={props.onClose}>{t('settings.close')}</button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = value.trim();
            if (!trimmed) return;
            props.onConfirm(trimmed);
          }}
        >
          <label>
            {props.label}
            <input
              key={props.inputKey ?? props.title}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
            />
          </label>
          <div className="prompt-modal__actions">
            <button type="button" className="ghost-button" onClick={props.onClose}>{t('prompt.cancel')}</button>
            <button type="submit" className="primary-action">{props.confirmLabel ?? t('prompt.save')}</button>
          </div>
        </form>
      </section>
    </ModalAnimatedPresence>
  );
}
