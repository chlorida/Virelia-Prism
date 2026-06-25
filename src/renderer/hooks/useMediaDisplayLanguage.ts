import { useI18n } from '../i18n/I18nProvider';
import { useOptionalAppShell } from '../app/AppShellContext';
import {
  resolveEffectiveMediaLanguage,
  type MediaDisplayLanguage,
} from '../lib/mediaIntelligence/languageResolution';

export function useMediaDisplayLanguage(): MediaDisplayLanguage {
  const { locale } = useI18n();
  const shell = useOptionalAppShell();
  return resolveEffectiveMediaLanguage({
    uiLanguage: shell?.settings.uiLanguage ?? 'auto',
    metadataLanguage: shell?.settings.metadata?.preferredLanguage,
    uiLocale: locale,
  });
}
