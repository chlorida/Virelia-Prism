import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultSettings } from '../shared/defaults';
import type { AppSettings } from '../shared/types';
import { AppShell } from './app/AppShell';
import { I18nProvider, useI18n } from './i18n/I18nProvider';
import { initDomFullscreenChrome } from './lib/domFullscreenChrome';
import { settingsStore } from './features/settings/settingsStore';
import { getPrism } from './lib/prismApi';
import { useStore } from './lib/useStore';import { PlaybackProvider } from './playback/PlaybackProvider';
import type { MediaErrorKey } from './playback/mediaErrors';
import type { TranslationKey } from '../shared/i18n';
import { startupLog } from './lib/startupLog';
import { configureTitleMetadata } from './lib/mediaIntelligence/metadata/titleMetadataService';
import { registerDefaultMetadataProviders } from './lib/mediaIntelligence/metadata/providers/registerProviders';
import { configureCharacterRecognition } from './lib/characterRecognition/characterRecognitionService';
import { initUiAudioSystem } from './services/uiAudioInit';
import { resolvePreferredMetadataLanguage } from './lib/displayTitleResolver';

export function App() {
  const [systemLocaleTag, setSystemLocaleTag] = useState(() => navigator.language);
  const settings = useStore(settingsStore, (state) => state.settings);

  useEffect(() => {
    registerDefaultMetadataProviders();
    configureTitleMetadata({
      language: resolvePreferredMetadataLanguage(settings),
    });
    return initUiAudioSystem();
  }, [settings?.metadata?.preferredLanguage]);

  useEffect(() => {
    configureCharacterRecognition(settings?.characterRecognition ?? defaultSettings.characterRecognition);
  }, [settings?.characterRecognition?.mode, settings?.characterRecognition?.backendUrl]);

  useEffect(() => {
    return initDomFullscreenChrome();
  }, []);
  useEffect(() => {
    const prism = getPrism();
    if (!prism) {
      setSystemLocaleTag(navigator.language);
      return;
    }
    void prism.system.locale()
      .then((tag) => setSystemLocaleTag(tag || navigator.language))
      .catch(() => setSystemLocaleTag(navigator.language));
  }, []);

  return (
    <I18nProvider settings={settings ?? defaultSettings} systemLocaleTag={systemLocaleTag}>
      <AppPlaybackShell settings={settings} />
    </I18nProvider>
  );
}

function AppPlaybackShell(props: { settings?: AppSettings }) {
  const { t } = useI18n();
  const translateError = useCallback(
    (key: MediaErrorKey) => t(key as TranslationKey),
    [t]
  );
  const onEndedRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    startupLog('AppShell', 'playback shell mounted');
  }, []);

  return (
    <PlaybackProvider
      settings={props.settings}
      translateError={translateError}
      onEndedRef={onEndedRef}
    >
      <AppShell onEndedRef={onEndedRef} />
    </PlaybackProvider>
  );
}
