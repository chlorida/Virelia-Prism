import { useEffect, useRef, useState } from 'react';
import type { AppSettings, UiLanguagePreference } from '../../shared/types';
import { defaultUiSoundsSettings } from '../../shared/uiAudioTypes';
import { defaultSettings } from '../../shared/defaults';
import { SUBTITLE_LANGUAGE_OPTIONS } from '../../shared/subtitleTypes';
import type {
  SubtitlePreferredLanguage,
  TranslationBackendKind,
  WhisperModelSize,
} from '../../shared/subtitleTypes';
import {
  clearGeneratedSubtitleCache,
  getSubtitleGenerationAvailability,
  listWhisperModels,
  type SubtitleGenerationAvailability,
} from '../lib/tauriCommands';
import { useI18n } from '../i18n/I18nProvider';
import { isTauriShell } from '../lib/prismAdapter';
import { navigateToDownloads } from '../features/library/libraryRouterStore';
import { UiSoundToggle } from './UiSoundToggle';
import { PrismToggle } from './PrismToggle';
import { ModalAnimatedPresence } from './AnimatedPresence';

interface SettingsModalProps {
  open: boolean;
  settings?: AppSettings;
  onClose: () => void;
  onSave: (settings: Partial<AppSettings>) => void;
}

function SettingsSection(props: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section className="settings-card">
      <header className="settings-card__header">
        <h3 className="settings-card__title">{props.title}</h3>
        {props.lead && <p className="settings-card__lead muted">{props.lead}</p>}
      </header>
      <div className="settings-card__grid">{props.children}</div>
    </section>
  );
}

type SettingsTab = 'interface' | 'discovery' | 'playback' | 'subtitles' | 'characters' | 'sounds' | 'advanced';

const SETTINGS_TABS: SettingsTab[] = [
  'interface',
  'discovery',
  'playback',
  'subtitles',
  'characters',
  'sounds',
  'advanced',
];

export function SettingsModal(props: SettingsModalProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('interface');
  const [speechAvailability, setSpeechAvailability] = useState<SubtitleGenerationAvailability | null>(null);
  const [installedWhisperModels, setInstalledWhisperModels] = useState<string[]>([]);

  const selectedWhisperModel = props.settings?.subtitles.whisperModel ?? 'base';

  useEffect(() => {
    if (!props.open || !isTauriShell()) {
      setSpeechAvailability(null);
      setInstalledWhisperModels([]);
      return;
    }
    void Promise.all([
      getSubtitleGenerationAvailability(selectedWhisperModel),
      listWhisperModels(),
    ]).then(([availability, installed]) => {
      setSpeechAvailability(availability);
      setInstalledWhisperModels(installed);
    });
  }, [props.open, selectedWhisperModel]);

  const autoGenerateEnabled = props.settings?.subtitles.autoGenerate ?? true;
  const speechBackendReady = speechAvailability?.ffmpegAvailable === true
    && speechAvailability?.whisperCliAvailable === true;
  const selectedModelInstalled = installedWhisperModels.includes(selectedWhisperModel);
  const showAutoGenerateBackendWarning = autoGenerateEnabled && speechAvailability != null && !speechBackendReady;
  const showSelectedModelMissingWarning = speechAvailability != null
    && speechBackendReady
    && !selectedModelInstalled;

  useEffect(() => {
    if (!props.open) return;
    setActiveTab('interface');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
    // Reset tab only when the modal opens — not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  return (
    <ModalAnimatedPresence
      open={props.open}
      role="dialog"
      aria-modal="true"
      onBackdropClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section className="settings-modal" ref={dialogRef} tabIndex={-1} aria-labelledby="settings-modal-title">
        <div className="settings-modal__header modal-header">
          <div>
            <p className="eyebrow">{t('settings.eyebrow')}</p>
            <h2 id="settings-modal-title">{t('settings.title')}</h2>
          </div>
          <div className="settings-modal__header-actions">
            <UiSoundToggle variant="header" />
            <button type="button" className="ghost-button" onClick={props.onClose}>{t('settings.close')}</button>
          </div>
        </div>

        <nav className="settings-tabs" role="tablist" aria-label={t('settings.title')}>
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={activeTab === tab ? 'settings-tab is-active' : 'settings-tab'}
              onClick={() => setActiveTab(tab)}
            >
              {t(`settings.tab.${tab}`)}
            </button>
          ))}
        </nav>

        <div className="settings-modal__body">
        <div className="settings-stack" role="tabpanel">
          {activeTab === 'interface' && (
          <SettingsSection title={t('settings.section.interface')} lead={t('settings.section.interfaceLead')}>
          <label>
            {t('settings.language')}
            <select
              value={props.settings?.uiLanguage ?? 'auto'}
              onChange={(event) => props.onSave({ uiLanguage: event.target.value as UiLanguagePreference })}
            >
              <option value="auto">{t('settings.language.auto')}</option>
              <option value="en">{t('settings.language.en')}</option>
              <option value="ru">{t('settings.language.ru')}</option>
            </select>
          </label>
          <label>
            {t('settings.theme')}
            <span className="settings-theme-label muted">{t('settings.theme.current')}</span>
          </label>

          <div className="settings-toggle settings-toggle--inline">
            <span>{t('settings.shell.pinSidebar')}</span>
            <PrismToggle
              checked={props.settings?.shell?.pinSidebar ?? false}
              onCheckedChange={(checked) => props.onSave({
                shell: {
                  pinSidebar: checked,
                  alwaysShowRightPanel: props.settings?.shell?.alwaysShowRightPanel ?? false,
                },
              })}
            />
          </div>
          <div className="settings-toggle settings-toggle--inline">
            <span>{t('settings.shell.alwaysShowRightPanel')}</span>
            <PrismToggle
              checked={props.settings?.shell?.alwaysShowRightPanel ?? false}
              onCheckedChange={(checked) => props.onSave({
                shell: {
                  pinSidebar: props.settings?.shell?.pinSidebar ?? false,
                  alwaysShowRightPanel: checked,
                },
              })}
            />
          </div>

          </SettingsSection>
          )}

          {activeTab === 'discovery' && (
          <SettingsSection title={t('settings.section.discovery')} lead={t('settings.section.discoveryLead')}>
          <div className="settings-toggle settings-toggle--inline">
            <span>{t('settings.discovery.askBrowser')}</span>
            <PrismToggle
              checked={props.settings?.discovery?.askBeforeOpeningBrowser ?? true}
              onCheckedChange={(checked) => props.onSave({
                discovery: {
                  ...(props.settings?.discovery ?? defaultDiscoveryPatch()),
                  askBeforeOpeningBrowser: checked,
                },
              })}
            />
          </div>
          <label>
            {t('settings.discovery.searchEngine')}
            <select
              value={props.settings?.discovery?.searchEngine ?? 'default'}
              onChange={(event) => props.onSave({
                discovery: {
                  ...(props.settings?.discovery ?? defaultDiscoveryPatch()),
                  searchEngine: event.target.value as AppSettings['discovery']['searchEngine'],
                },
              })}
            >
              <option value="default">{t('settings.searchEngine.default')}</option>
              <option value="google">{t('settings.searchEngine.google')}</option>
              <option value="bing">{t('settings.searchEngine.bing')}</option>
              <option value="duckduckgo">{t('settings.searchEngine.duckduckgo')}</option>
              <option value="custom">{t('settings.searchEngine.custom')}</option>
            </select>
          </label>
          <label>
            {t('settings.discovery.region')}
            <input
              value={props.settings?.discovery?.region ?? 'auto'}
              onChange={(event) => props.onSave({
                discovery: {
                  ...(props.settings?.discovery ?? defaultDiscoveryPatch()),
                  region: event.target.value,
                },
              })}
            />
          </label>
          <div className="settings-toggle settings-toggle--inline">
            <span>{t('settings.discovery.enableReviews')}</span>
            <PrismToggle
              checked={props.settings?.discovery?.enableReviews ?? true}
              onCheckedChange={(checked) => props.onSave({
                discovery: {
                  ...(props.settings?.discovery ?? defaultDiscoveryPatch()),
                  enableReviews: checked,
                },
              })}
            />
          </div>
          <div className="settings-toggle settings-toggle--inline">
            <span>{t('settings.discovery.enableRecommendations')}</span>
            <PrismToggle
              checked={props.settings?.discovery?.enableRecommendations ?? true}
              onCheckedChange={(checked) => props.onSave({
                discovery: {
                  ...(props.settings?.discovery ?? defaultDiscoveryPatch()),
                  enableRecommendations: checked,
                },
              })}
            />
          </div>
          <div className="settings-toggle settings-toggle--inline">
            <span>{t('settings.discovery.enableOnlineCatalog')}</span>
            <PrismToggle
              checked={props.settings?.discovery?.enableOnlineCatalog ?? true}
              onCheckedChange={(checked) => props.onSave({
                discovery: {
                  ...(props.settings?.discovery ?? defaultDiscoveryPatch()),
                  enableOnlineCatalog: checked,
                },
                ...(checked ? {
                  metadata: {
                    preferredLanguage: props.settings?.metadata?.preferredLanguage ?? 'auto',
                    enableOnlineLookup: true,
                    metadataRefreshOnTitleOpen: props.settings?.metadata?.metadataRefreshOnTitleOpen ?? true,
                    metadataCardsSimpleMode: props.settings?.metadata?.metadataCardsSimpleMode ?? true,
                  },
                } : {}),
              })}
            />
          </div>
          {import.meta.env.DEV && (
            <label>
              {t('settings.discovery.gatewayBaseUrl')}
              <small className="muted settings-hint">{t('settings.discovery.gatewayBaseUrlHint')}</small>
              <input
                type="url"
                autoComplete="off"
                placeholder="https://metadata.prism.virelia.app/v1"
                value={props.settings?.discovery?.gatewayBaseUrl ?? ''}
                onChange={(event) => props.onSave({
                  discovery: {
                    ...(props.settings?.discovery ?? defaultDiscoveryPatch()),
                    gatewayBaseUrl: event.target.value,
                  },
                })}
              />
            </label>
          )}
          <div className="settings-toggle settings-toggle--inline">
            <span>{t('settings.discovery.enableCatalogSearch')}</span>
            <PrismToggle
              checked={props.settings?.discovery?.enableCatalogSearch ?? true}
              onCheckedChange={(checked) => props.onSave({
                discovery: {
                  ...(props.settings?.discovery ?? defaultDiscoveryPatch()),
                  enableCatalogSearch: checked,
                },
              })}
            />
          </div>
          <div className="settings-toggle settings-toggle--inline">
            <span>{t('settings.discovery.enableDiscoverRails')}</span>
            <PrismToggle
              checked={props.settings?.discovery?.enableDiscoverCatalogRails ?? true}
              onCheckedChange={(checked) => props.onSave({
                discovery: {
                  ...(props.settings?.discovery ?? defaultDiscoveryPatch()),
                  enableDiscoverCatalogRails: checked,
                },
              })}
            />
          </div>
          <div className="settings-toggle settings-toggle--inline">
            <span>{t('settings.discovery.includeAdult')}</span>
            <PrismToggle
              checked={props.settings?.discovery?.includeAdultContent ?? false}
              onCheckedChange={(checked) => props.onSave({
                discovery: {
                  ...(props.settings?.discovery ?? defaultDiscoveryPatch()),
                  includeAdultContent: checked,
                },
              })}
            />
          </div>

          <div className="settings-toggle settings-toggle--inline">
            <div className="settings-toggle__text">
              <span>{t('settings.metadata.enableOnline')}</span>
              <small className="muted settings-hint">{t('settings.metadata.enableOnlineHint')}</small>
            </div>
            <PrismToggle
              checked={props.settings?.metadata?.enableOnlineLookup ?? true}
              onCheckedChange={(checked) => props.onSave({
                metadata: {
                  preferredLanguage: props.settings?.metadata?.preferredLanguage ?? 'auto',
                  enableOnlineLookup: checked,
                  metadataRefreshOnTitleOpen: props.settings?.metadata?.metadataRefreshOnTitleOpen ?? true,
                  metadataCardsSimpleMode: props.settings?.metadata?.metadataCardsSimpleMode ?? false,
                },
                ...(!checked ? {
                  discovery: {
                    ...(props.settings?.discovery ?? defaultDiscoveryPatch()),
                    enableOnlineCatalog: false,
                  },
                } : {}),
              })}
            />
          </div>

          </SettingsSection>
          )}

          {activeTab === 'playback' && (
          <SettingsSection title={t('settings.section.playback')} lead={t('settings.section.playbackLead')}>
          <label>
            {t('settings.engine')}
            <select
              value={props.settings?.playback.preferredEngine ?? 'html5-fallback'}
              onChange={(event) => props.onSave({
                playback: {
                  ...(props.settings?.playback ?? defaultPlaybackPatch()),
                  preferredEngine: event.target.value as AppSettings['playback']['preferredEngine']
                }
              })}
            >
              <option value="html5-fallback">{t('settings.engine.html5')}</option>
              <option value="mpv">{t('settings.engine.mpv')}</option>
            </select>
          </label>

          </SettingsSection>
          )}

          {activeTab === 'subtitles' && (
          <>
          <SettingsSection title={t('settings.section.subtitles')} lead={t('settings.section.subtitlesLead')}>
          <label>
            {t('settings.subtitles.preferred')}
            <select
              value={props.settings?.subtitles.preferredLanguage ?? props.settings?.subtitles.defaultLanguage ?? 'auto'}
              onChange={(event) => props.onSave({
                subtitles: {
                  ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                  preferredLanguage: event.target.value as SubtitlePreferredLanguage,
                  defaultLanguage: event.target.value
                }
              })}
            >
              {SUBTITLE_LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey as Parameters<typeof t>[0])}</option>
              ))}
            </select>
          </label>
          <div className="settings-toggle">
            <span>{t('settings.subtitles.autoLoad')}</span>
            <PrismToggle
              checked={props.settings?.subtitles.autoLoad ?? true}
              onCheckedChange={(checked) => props.onSave({
                subtitles: {
                  ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                  autoLoad: checked
                }
              })}
            />
          </div>
          <div className="settings-toggle settings-toggle--stacked">
            <span>{t('settings.subtitles.autoGenerate')}</span>
            <small className="muted settings-hint">{t('settings.subtitles.autoGenerateHint')}</small>
            {showAutoGenerateBackendWarning && (
              <small className="settings-hint settings-hint--warning">
                {t('settings.subtitles.autoGenerateBackendMissing')}
              </small>
            )}
            <PrismToggle
              checked={autoGenerateEnabled}
              onCheckedChange={(checked) => props.onSave({
                subtitles: {
                  ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                  autoGenerate: checked
                }
              })}
            />
          </div>
          <label>
            {t('settings.subtitles.format')}
            <select
              value={props.settings?.subtitles.generatedFormat ?? 'vtt'}
              onChange={(event) => props.onSave({
                subtitles: {
                  ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                  generatedFormat: event.target.value as 'vtt' | 'srt'
                }
              })}
            >
              <option value="vtt">{t('settings.subtitleFormat.vtt')}</option>
              <option value="srt">{t('settings.subtitleFormat.srt')}</option>
              <option value="ass">{t('settings.subtitleFormat.ass')}</option>
            </select>
          </label>
          <label>
            {t('settings.subtitles.saveLocation')}
            <select
              value={props.settings?.subtitles.saveLocation ?? 'cache'}
              onChange={(event) => props.onSave({
                subtitles: {
                  ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                  saveLocation: event.target.value as 'cache' | 'next-to-video'
                }
              })}
            >
              <option value="cache">{t('settings.subtitles.saveCache')}</option>
              <option value="next-to-video">{t('settings.subtitles.saveNextToVideo')}</option>
            </select>
          </label>
          <label>
            {t('settings.subtitles.translation')}
            <select
              value={props.settings?.subtitles.translation?.backend ?? 'disabled'}
              onChange={(event) => props.onSave({
                subtitles: {
                  ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                  translation: {
                    ...(props.settings?.subtitles.translation ?? { backend: 'disabled' }),
                    backend: event.target.value as TranslationBackendKind
                  }
                }
              })}
            >
              <option value="builtin">{t('settings.subtitles.translation.builtin')}</option>
              <option value="disabled">{t('settings.subtitles.translation.disabled')}</option>
              <option value="mock">{t('settings.subtitles.translation.mock')}</option>
              <option value="local-command">{t('settings.subtitles.translation.localCommand')}</option>
              <option value="local-http">{t('settings.subtitles.translation.localHttp')}</option>
              <option value="custom-api">{t('settings.subtitles.translation.customApi')}</option>
            </select>
          </label>
          {(props.settings?.subtitles.translation?.backend === 'local-command') && (
            <label>
              {t('settings.subtitles.translation.command')}
              <input
                defaultValue={props.settings?.subtitles.translation?.command ?? ''}
                onBlur={(event) => props.onSave({
                  subtitles: {
                    ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                    translation: {
                      ...(props.settings?.subtitles.translation ?? { backend: 'local-command' }),
                      command: event.target.value
                    }
                  }
                })}
              />
            </label>
          )}
          {(props.settings?.subtitles.translation?.backend === 'local-http'
            || props.settings?.subtitles.translation?.backend === 'custom-api') && (
            <label>
              {t('settings.subtitles.translation.httpUrl')}
              <input
                defaultValue={props.settings?.subtitles.translation?.httpUrl ?? ''}
                onBlur={(event) => props.onSave({
                  subtitles: {
                    ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                    translation: {
                      ...(props.settings?.subtitles.translation ?? { backend: 'local-http' }),
                      httpUrl: event.target.value
                    }
                  }
                })}
              />
            </label>
          )}
          <label>
            {t('settings.subtitles.speakerColors')}
            <select
              value={props.settings?.subtitles.speakerColors ?? 'auto'}
              onChange={(event) => props.onSave({
                subtitles: {
                  ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                  speakerColors: event.target.value as 'off' | 'auto' | 'franchise'
                }
              })}
            >
              <option value="off">{t('settings.subtitles.speakerColors.off')}</option>
              <option value="auto">{t('settings.subtitles.speakerColors.auto')}</option>
              <option value="franchise">{t('settings.subtitles.speakerColors.franchise')}</option>
            </select>
          </label>
          <label>
            {t('settings.subtitles.nameStyle')}
            <select
              value={props.settings?.subtitles.nameStyle ?? 'localized'}
              onChange={(event) => props.onSave({
                subtitles: {
                  ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                  nameStyle: event.target.value as 'localized' | 'original'
                }
              })}
            >
              <option value="localized">{t('settings.subtitles.nameStyle.localized')}</option>
              <option value="original">{t('settings.subtitles.nameStyle.original')}</option>
            </select>
          </label>
          <div className="settings-toggle">
            <span>{t('settings.subtitles.showSoundLabels')}</span>
            <PrismToggle
              checked={props.settings?.subtitles.showSoundLabels ?? false}
              onCheckedChange={(checked) => props.onSave({
                subtitles: {
                  ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                  showSoundLabels: checked
                }
              })}
            />
          </div>

          </SettingsSection>

          <SettingsSection title={t('settings.section.speechRecognition')} lead={t('settings.section.speechRecognitionLead')}>
          <label>
            {t('settings.subtitles.transcriptionBackend')}
            <select
              value={props.settings?.subtitles.transcriptionBackend ?? 'whisper-cpp'}
              onChange={(event) => props.onSave({
                subtitles: {
                  ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                  transcriptionBackend: event.target.value as AppSettings['subtitles']['transcriptionBackend'],
                }
              })}
            >
              <option value="disabled">{t('settings.subtitles.transcription.disabled')}</option>
              <option value="whisper-cpp">{t('settings.subtitles.transcription.whisperCpp')}</option>
              <option value="faster-whisper">{t('settings.subtitles.transcription.fasterWhisper')}</option>
              <option value="custom-command">{t('settings.subtitles.transcription.customCommand')}</option>
            </select>
          </label>
          <label>
            {t('settings.subtitles.whisperModel')}
            <select
              value={selectedWhisperModel}
              onChange={(event) => props.onSave({
                subtitles: {
                  ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                  whisperModel: event.target.value as WhisperModelSize
                }
              })}
            >
              {(['tiny', 'base', 'small', 'medium', 'large-v3'] as const).map((model) => (
                <option key={model} value={model}>
                  {model}
                  {installedWhisperModels.length > 0 && !installedWhisperModels.includes(model)
                    ? ` (${t('settings.subtitles.whisperModelNotInstalled')})`
                    : ''}
                </option>
              ))}
            </select>
          </label>
          {showSelectedModelMissingWarning && (
            <p className="settings-hint settings-hint--warning">
              {t('settings.subtitles.whisperModelMissing', { model: selectedWhisperModel })}
            </p>
          )}
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              props.onClose();
              navigateToDownloads();
            }}
          >
            {t('settings.subtitles.manageModels')}
          </button>
          <p className="settings-hint">{t('settings.subtitles.whisperModelAnimeHint')}</p>
          <p className="settings-hint">
            {t('settings.subtitles.whisperModelPathHint', {
              model: selectedWhisperModel,
            })}
          </p>
          <label>
            {t('settings.subtitles.whisperGpu')}
            <select
              value={props.settings?.subtitles.whisperGpu ?? 'auto'}
              onChange={(event) => props.onSave({
                subtitles: {
                  ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                  whisperGpu: event.target.value as AppSettings['subtitles']['whisperGpu'],
                }
              })}
            >
              <option value="auto">{t('settings.subtitles.whisperGpu.auto')}</option>
              <option value="on">{t('settings.subtitles.whisperGpu.on')}</option>
              <option value="off">{t('settings.subtitles.whisperGpu.off')}</option>
            </select>
          </label>
          {(props.settings?.subtitles.whisperGpu ?? 'auto') !== 'off' && (
            <label>
              {t('settings.subtitles.whisperGpuLayers')}
              <input
                type="number"
                min={1}
                max={99}
                value={props.settings?.subtitles.whisperGpuLayers ?? 99}
                onChange={(event) => props.onSave({
                  subtitles: {
                    ...(props.settings?.subtitles ?? defaultSubtitlesPatch()),
                    whisperGpuLayers: Math.max(1, Math.min(99, Number(event.target.value) || 99)),
                  }
                })}
              />
            </label>
          )}
          <p className="settings-hint">{t('settings.subtitles.whisperGpuHint')}</p>
          {speechAvailability?.whisperGpuAvailable ? (
            <p className="settings-hint">
              {t('settings.subtitles.whisperGpuAvailable', {
                backend: speechAvailability.whisperGpuBackend ?? 'gpu',
              })}
            </p>
          ) : speechAvailability?.whisperCliAvailable ? (
            <p className="settings-hint settings-hint--warning">
              {t('settings.subtitles.whisperGpuUnavailable')}
            </p>
          ) : null}

          </SettingsSection>
          </>
          )}

          {activeTab === 'characters' && (
          <SettingsSection title={t('settings.section.characterRecognition')} lead={t('settings.section.characterRecognitionLead')}>
          <label>
            {t('settings.characterRecognition.modeLabel')}
            <select
              value={props.settings?.characterRecognition?.mode ?? 'disabled'}
              onChange={(event) => props.onSave({
                characterRecognition: {
                  mode: event.target.value as 'disabled' | 'local-http' | 'mock',
                  backendUrl: event.target.value === 'local-http'
                    ? (props.settings?.characterRecognition?.backendUrl ?? '')
                    : '',
                },
              })}
            >
              <option value="disabled">{t('settings.characterRecognition.mode.disabled')}</option>
              <option value="local-http">{t('settings.characterRecognition.mode.localHttp')}</option>
              <option value="mock">{t('settings.characterRecognition.mode.mock')}</option>
            </select>
          </label>
          {(props.settings?.characterRecognition?.mode ?? 'disabled') === 'local-http' && (
            <label>
              {t('settings.characterRecognition.backendUrl')}
              <input
                type="url"
                placeholder={t('settings.characterRecognition.backendUrlPlaceholder')}
                value={props.settings?.characterRecognition?.backendUrl ?? ''}
                onChange={(event) => props.onSave({
                  characterRecognition: {
                    mode: 'local-http',
                    backendUrl: event.target.value,
                  },
                })}
              />
            </label>
          )}
          <p className="muted settings-hint settings-hint--block">
            {t('settings.characterRecognition.privacy')}
          </p>
          {(props.settings?.characterRecognition?.mode ?? 'disabled') === 'disabled' && (
            <p className="muted settings-hint settings-hint--block">
              {t('settings.characterRecognition.disabledNote')}
            </p>
          )}
          {(props.settings?.characterRecognition?.mode ?? 'disabled') === 'mock' && (
            <p className="muted settings-hint settings-hint--block">
              {t('settings.characterRecognition.mockNote')}
            </p>
          )}

          </SettingsSection>
          )}

          {activeTab === 'sounds' && (
          <SettingsSection title={t('settings.section.uiSounds')} lead={t('settings.section.uiSoundsLead')}>
          <div className="settings-toggle settings-toggle--inline">
            <div className="settings-toggle__text">
              <span>{t('settings.uiSounds.enabled')}</span>
              <small className="muted settings-hint">{t('settings.uiSounds.enabledHint')}</small>
            </div>
            <PrismToggle
              checked={props.settings?.uiSounds?.enabled ?? false}
              onCheckedChange={(checked) => props.onSave({
                uiSounds: {
                  ...(props.settings?.uiSounds ?? defaultUiSoundsPatch()),
                  enabled: checked,
                },
              })}
            />
          </div>
          <label>
            {t('settings.uiSounds.volume')}
            <div className="settings-range-row">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((props.settings?.uiSounds?.volume ?? 0.12) * 100)}
                onChange={(event) => props.onSave({
                  uiSounds: {
                    ...(props.settings?.uiSounds ?? defaultUiSoundsPatch()),
                    volume: Number(event.target.value) / 100,
                  },
                })}
              />
              <span className="settings-range-value">
                {Math.round((props.settings?.uiSounds?.volume ?? 0.12) * 100)}%
              </span>
            </div>
          </label>
          <label>
            {t('settings.uiSounds.duringPlayback')}
            <select
              value={props.settings?.uiSounds?.duringPlayback ?? 'important_only'}
              onChange={(event) => props.onSave({
                uiSounds: {
                  ...(props.settings?.uiSounds ?? defaultUiSoundsPatch()),
                  duringPlayback: event.target.value as AppSettings['uiSounds']['duringPlayback'],
                },
              })}
            >
              <option value="always">{t('settings.uiSounds.duringPlayback.always')}</option>
              <option value="important_only">{t('settings.uiSounds.duringPlayback.important')}</option>
              <option value="disabled">{t('settings.uiSounds.duringPlayback.disabled')}</option>
            </select>
          </label>
          <fieldset className="settings-fieldset">
            <legend>{t('settings.uiSounds.categories')}</legend>
            {(['playback', 'navigation', 'queue', 'notifications', 'warnings'] as const).map((category) => (
              <div key={category} className="settings-toggle settings-toggle--inline">
                <span>{t(`settings.uiSounds.category.${category}`)}</span>
                <PrismToggle
                  checked={props.settings?.uiSounds?.categories?.[category] ?? true}
                  onCheckedChange={(checked) => props.onSave({
                    uiSounds: {
                      ...(props.settings?.uiSounds ?? defaultUiSoundsPatch()),
                      categories: {
                        ...(props.settings?.uiSounds?.categories ?? defaultUiSoundsPatch().categories),
                        [category]: checked,
                      },
                    },
                  })}
                />
              </div>
            ))}
          </fieldset>
          </SettingsSection>
          )}

          {activeTab === 'advanced' && (
          <>
          <SettingsSection title={t('settings.section.advanced')} lead={t('settings.section.advancedLead')}>
          <label>
            {t('settings.subtitles.clearCache')}
            <button
              type="button"
              className="ghost-button"
              onClick={() => { void clearGeneratedSubtitleCache(); }}
            >
              {t('settings.subtitles.clearCache')}
            </button>
          </label>
          <label>
            {t('settings.mpvPath')}
            <input
              key={props.settings?.playback.mpvPath ?? 'default'}
              placeholder={t('settings.mpvPathPlaceholder')}
              defaultValue={props.settings?.playback.mpvPath ?? ''}
              onBlur={(event) => props.onSave({
                playback: {
                  ...(props.settings?.playback ?? defaultPlaybackPatch()),
                  mpvPath: event.target.value || undefined
                }
              })}
            />
          </label>
          <div className="settings-toggle">
            <span>{t('settings.minimizeTray')}</span>
            <PrismToggle
              checked={props.settings?.minimizeToTray ?? true}
              onCheckedChange={(checked) => props.onSave({ minimizeToTray: checked })}
            />
          </div>
          <div className="settings-toggle">
            <span>{t('settings.startWithWindows')}</span>
            <PrismToggle
              checked={props.settings?.startWithWindows ?? false}
              onCheckedChange={(checked) => props.onSave({ startWithWindows: checked })}
            />
          </div>
          </SettingsSection>

        <section className="shortcut-card">
          <p className="section-label">{t('settings.shortcuts')}</p>
          <p>{t('settings.shortcutsHelp')}</p>
        </section>
          </>
          )}
        </div>
        </div>

      </section>
    </ModalAnimatedPresence>
  );
}

function defaultSubtitlesPatch(): AppSettings['subtitles'] {
  return {
    defaultLanguage: 'auto',
    preferredLanguage: 'auto',
    timingOffsetMs: 0,
    autoLoad: true,
    autoGenerate: true,
    progressiveSubtitleGeneration: true,
    usePartialGeneratedSubtitles: true,
    subtitleTimelineCoverage: true,
    generatedFormat: 'vtt',
    saveLocation: 'cache',
    whisperModel: 'base',
    whisperGpu: 'auto',
    whisperGpuLayers: 99,
    translation: { backend: 'disabled' },
    speakerColors: 'auto',
    nameStyle: 'localized',
    showSoundLabels: true
  };
}

function defaultUiSoundsPatch(): AppSettings['uiSounds'] {
  return defaultUiSoundsSettings();
}

function defaultDiscoveryPatch(): AppSettings['discovery'] {
  return defaultSettings.discovery;
}

function defaultPlaybackPatch(): AppSettings['playback'] {
  return {
    volume: 0.74,
    speed: 1,
    muted: false,
    repeat: 'off',
    shuffle: false,
    preferredEngine: 'html5-fallback'
  };
}
