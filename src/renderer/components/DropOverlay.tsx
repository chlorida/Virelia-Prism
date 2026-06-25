import { useI18n } from '../i18n/I18nProvider';
import { AnimatedPresence } from './AnimatedPresence';

interface DropOverlayProps {
  visible: boolean;
}

export function DropOverlay(props: DropOverlayProps) {
  const { t } = useI18n();

  return (
    <AnimatedPresence open={props.visible} className="drop-overlay" role="status" aria-live="polite">
      <div className="drop-overlay__card">
        <strong>{t('drop.title')}</strong>
        <span>{t('drop.hint')}</span>
      </div>
    </AnimatedPresence>
  );
}
