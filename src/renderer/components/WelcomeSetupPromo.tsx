import { memo } from 'react';
import { useI18n } from '../i18n/I18nProvider';

interface WelcomeSetupPromoProps {
  onRun: () => void;
}

export const WelcomeSetupPromo = memo(function WelcomeSetupPromo(props: WelcomeSetupPromoProps) {
  const { t } = useI18n();

  return (
    <aside className="welcome-setup-promo glass-inset" aria-label={t('settings.onboarding.title')}>
      <div className="welcome-setup-promo__copy">
        <p className="welcome-setup-promo__title">{t('settings.onboarding.title')}</p>
        <p className="muted welcome-setup-promo__hint">{t('settings.onboarding.hint')}</p>
      </div>
      <button type="button" className="ghost-button welcome-setup-promo__action" onClick={props.onRun}>
        {t('settings.onboarding.runAgain')}
      </button>
    </aside>
  );
});
