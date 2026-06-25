import type { UiLanguagePreference } from '../../../shared/types';
import type { UiLocale } from '../../../shared/i18n';

export type MediaDisplayLanguage = 'en' | 'ru';

/** Effective language for media titles — never mixes UI and navigator accidentally. */
export function resolveEffectiveMediaLanguage(options: {
  uiLanguage: UiLanguagePreference;
  metadataLanguage?: UiLanguagePreference;
  uiLocale?: UiLocale;
}): MediaDisplayLanguage {
  const { metadataLanguage, uiLanguage, uiLocale } = options;
  if (metadataLanguage === 'en' || metadataLanguage === 'ru') return metadataLanguage;
  if (uiLanguage === 'en' || uiLanguage === 'ru') return uiLanguage;
  if (uiLocale === 'en' || uiLocale === 'ru') return uiLocale;
  return 'en';
}
