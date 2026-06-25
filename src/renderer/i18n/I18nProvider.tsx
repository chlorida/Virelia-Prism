import { createContext, useContext, useEffect, useMemo } from 'react';
import type { AppSettings } from '../../shared/types';
import {
  resolveUiLocale,
  translate,
  type TranslationKey,
  type UiLocale
} from '../../shared/i18n';

interface I18nContextValue {
  locale: UiLocale;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  settings?: AppSettings;
  systemLocaleTag: string;
  children: React.ReactNode;
}

export function I18nProvider(props: I18nProviderProps) {
  const locale = useMemo(
    () => resolveUiLocale(props.settings?.uiLanguage ?? 'auto', props.systemLocaleTag),
    [props.settings?.uiLanguage, props.systemLocaleTag]
  );

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    t: (key, params) => translate(locale, key, params)
  }), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext.Provider value={value}>
      {props.children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
