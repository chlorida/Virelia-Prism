import type { ReactNode } from 'react';
import type { AppSettings } from '../../shared/types';
import { I18nProvider } from '../i18n/I18nProvider';
import { PlaybackProvider } from '../playback/PlaybackProvider';
import type { MediaErrorKey } from '../playback/mediaErrors';
import type { TranslationKey } from '../../shared/i18n';
import { defaultSettings } from '../../shared/defaults';

interface AppProvidersProps {
  children: ReactNode;
  settings?: AppSettings;
  systemLocaleTag: string;
  translateError: (key: MediaErrorKey) => string;
  onEndedRef: React.MutableRefObject<() => void>;
}

export function AppProviders(props: AppProvidersProps) {
  return (
    <I18nProvider settings={props.settings ?? defaultSettings} systemLocaleTag={props.systemLocaleTag}>
      <PlaybackProvider
        settings={props.settings}
        translateError={props.translateError}
        onEndedRef={props.onEndedRef}
      >
        {props.children}
      </PlaybackProvider>
    </I18nProvider>
  );
}

export type { TranslationKey };
