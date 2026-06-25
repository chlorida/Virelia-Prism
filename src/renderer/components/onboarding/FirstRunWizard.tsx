import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../lib/useStore';
import type { AppSettings, UiLanguagePreference } from '../../../shared/types';
import type { WhisperModelSize } from '../../../shared/subtitleTypes';
import { defaultUiSoundsSettings } from '../../../shared/uiAudioTypes';
import { configureUiAudio, playUiSound } from '../../services/uiAudioService';
import type { FirstRunSetupBenchmarkResult } from '../../lib/tauriCommands';
import {
  cancelWhisperDownload,
  refreshInstalledWhisperModels,
  startWhisperModelDownloadInBackground,
} from '../../features/downloads/downloadService';
import { downloadStore } from '../../features/downloads/downloadStore';
import { whisperDownloadId } from '../../features/downloads/downloadTypes';
import {
  benchmarkTierKey,
  fallbackRecommendedModel,
  getCachedOnboardingBenchmark,
  loadOnboardingBenchmark,
  prefetchOnboardingBenchmark,
  runDeepOnboardingBenchmark,
} from './onboardingBenchmark';
import { ModalAnimatedPresence } from '../AnimatedPresence';
import { PrismToggle } from '../PrismToggle';
import {
  getOnboardingCopy,
  getOnboardingModelCopy,
  getRecommendationCopy,
  resolveOnboardingLang,
  type OnboardingModelId,
} from './onboardingCopy';

type WizardMode = 'first-run' | 'manual';
type StepId = 'language' | 'metadata' | 'library' | 'catalog' | 'online' | 'test' | 'model' | 'import' | 'welcome';

const MODEL_IDS: OnboardingModelId[] = ['base', 'small', 'medium', 'large-v3'];

const STEPS: Array<{ id: StepId }> = [
  { id: 'language' },
  { id: 'metadata' },
  { id: 'library' },
  { id: 'catalog' },
  { id: 'online' },
  { id: 'test' },
  { id: 'model' },
  { id: 'import' },
  { id: 'welcome' },
];

interface FirstRunWizardProps {
  open: boolean;
  mode?: WizardMode;
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => Promise<unknown> | void;
  onComplete: () => void;
  onImportFolder?: () => void;
}

function formatSizeLabel(bytes: number | undefined, fallbackMb: number): string {
  if (bytes && Number.isFinite(bytes) && bytes > 0) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `~${fallbackMb} MB`;
}

export function FirstRunWizard(props: FirstRunWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<'next' | 'back'>('next');
  const [uiLanguage, setUiLanguage] = useState<UiLanguagePreference>(
    props.settings.uiLanguage ?? 'auto'
  );
  const [metadataLanguage, setMetadataLanguage] = useState<UiLanguagePreference>(
    props.settings.metadata?.preferredLanguage ?? 'auto'
  );
  const [benchmark, setBenchmark] = useState<FirstRunSetupBenchmarkResult | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [deepCheckState, setDeepCheckState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [autoRecommend, setAutoRecommend] = useState(true);
  const [selectedModel, setSelectedModel] = useState<WhisperModelSize>(
    props.settings.onboarding?.recommendedWhisperModel ?? props.settings.subtitles.whisperModel ?? 'base'
  );
  const [autoGenerate, setAutoGenerate] = useState(props.settings.subtitles.autoGenerate ?? true);
  const [includeAdultContent, setIncludeAdultContent] = useState(
    props.settings.discovery?.includeAdultContent ?? false
  );
  const [onlineCatalogEnabled, setOnlineCatalogEnabled] = useState(() => {
    const discovery = props.settings.discovery;
    if (discovery?.disableOnlineDiscovery) return false;
    return discovery?.enableOnlineCatalog ?? true;
  });
  const [uiSoundsEnabled, setUiSoundsEnabled] = useState(
    props.settings.uiSounds?.enabled ?? true
  );
  const [saving, setSaving] = useState(false);
  const [downloadedModel, setDownloadedModel] = useState<WhisperModelSize | null>(null);
  const [exiting, setExiting] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [glowLanding, setGlowLanding] = useState(false);
  const [flightHandoff, setFlightHandoff] = useState(false);
  const [finaleActive, setFinaleActive] = useState(false);
  const [finaleDismissed, setFinaleDismissed] = useState(false);
  const [exitFlight, setExitFlight] = useState<{
    left: number;
    top: number;
    fontSize: string;
    letterSpacing: string;
    fontFamily: string;
    fontWeight: string;
    lineHeight: string;
    text: string;
    flightTransform: string;
  } | null>(null);
  const prismWordRef = useRef<HTMLSpanElement>(null);

  const copy = useMemo(
    () => getOnboardingCopy(resolveOnboardingLang(uiLanguage)),
    [uiLanguage]
  );

  useEffect(() => {
    if (!props.open) return;
    const cached = getCachedOnboardingBenchmark();
    setStepIndex(0);
    setDirection('next');
    setBenchmarkError(null);
    setDeepCheckState('idle');
    setDownloadedModel(null);
    setExiting(false);
    setHoldOpen(false);
    setGlowLanding(false);
    setFlightHandoff(false);
    setFinaleActive(false);
    setFinaleDismissed(false);
    setExitFlight(null);
    setUiLanguage(props.settings.uiLanguage ?? 'auto');
    setMetadataLanguage(props.settings.metadata?.preferredLanguage ?? 'auto');
    setAutoGenerate(props.settings.subtitles.autoGenerate ?? true);
    setIncludeAdultContent(props.settings.discovery?.includeAdultContent ?? false);
    setOnlineCatalogEnabled(
      props.settings.discovery?.disableOnlineDiscovery
        ? false
        : (props.settings.discovery?.enableOnlineCatalog ?? true)
    );
    setUiSoundsEnabled(props.settings.uiSounds?.enabled ?? true);
    setAutoRecommend(true);
    if (cached) {
      setBenchmark(cached);
      setSelectedModel(cached.recommendation.modelId);
    } else {
      setBenchmark(null);
      setSelectedModel(
        props.settings.onboarding?.recommendedWhisperModel
          ?? props.settings.subtitles.whisperModel
          ?? fallbackRecommendedModel()
      );
    }
  }, [props.open, props.settings.onboarding?.recommendedWhisperModel, props.settings.subtitles.whisperModel]);

  useEffect(() => {
    if (!props.open) return;
    const snapshot = prefetchOnboardingBenchmark();
    setBenchmark(snapshot);
    if (autoRecommend) {
      setSelectedModel(snapshot.recommendation.modelId);
    }
    void loadOnboardingBenchmark().then((result) => {
      if (!autoRecommend) return;
      setBenchmark(result);
      setSelectedModel(result.recommendation.modelId);
    });
  }, [props.open, autoRecommend]);

  const welcomeStepIndex = STEPS.findIndex((s) => s.id === 'welcome');
  const importStepIndex = STEPS.findIndex((s) => s.id === 'import');
  const hasLibraryFolders = (props.settings.libraryFolders?.length ?? 0) > 0;

  const step = STEPS[stepIndex];
  const storeInstalledModels = useStore(downloadStore, (state) => state.installedWhisperModels);
  const recommendedId = autoRecommend ? benchmark?.recommendation.modelId : undefined;
  const installedIds = new Set<string>([
    ...(benchmark?.resources.installedModels ?? []),
    ...storeInstalledModels,
  ]);
  if (downloadedModel) installedIds.add(downloadedModel);

  const modelCards = MODEL_IDS.map((id) => {
    const meta = copy.models[id];
    const backend = benchmark?.models.find((m) => m.id === id);
    const installed = installedIds.has(id) || Boolean(backend?.installed);
    return {
      id,
      label: meta.label,
      description: meta.description,
      detail: meta.detail,
      estimatedSizeMb: backend?.estimatedSizeMb ?? (
        id === 'base' ? 150 : id === 'small' ? 466 : id === 'medium' ? 1530 : 3090
      ),
      installed,
      recommended: recommendedId === id,
    };
  });

  const selectedCard = modelCards.find((m) => m.id === selectedModel) ?? modelCards[0];
  const modelDownload = useStore(
    downloadStore,
    (state) => state.items[whisperDownloadId(selectedModel)]
  );
  const selectedInstalled = selectedCard.installed || modelDownload?.status === 'complete';
  const downloadProgress = modelDownload
    ? {
        modelId: selectedModel,
        downloadedBytes: modelDownload.downloadedBytes,
        totalBytes: modelDownload.totalBytes,
        progress: modelDownload.progress,
        status:
          modelDownload.status === 'queued'
            ? ('starting' as const)
            : modelDownload.status === 'failed'
              ? ('cancelled' as const)
              : modelDownload.status,
      }
    : null;
  const downloadError = modelDownload?.error ?? null;
  const downloadPercent = Math.round((downloadProgress?.progress ?? 0) * 100);
  const benchmarkReady = Boolean(benchmark);
  const isDownloading = downloadProgress?.status === 'downloading' || downloadProgress?.status === 'starting';
  const tier = benchmarkTierKey(benchmark);

  const progressLabel = benchmarkReady
    ? copy.benchmarkReady
    : benchmarkError
      ? copy.benchmarkManual
      : copy.benchmarkRunning;

  const recommendedLabel = recommendedId
    ? getOnboardingModelCopy(copy, recommendedId).label
    : copy.pickingModel;

  const recommendationText = recommendedId
    ? getRecommendationCopy(copy, tier, recommendedId)
    : copy.testFailed;

  const testDetailText = (() => {
    if (deepCheckState === 'running') return copy.deepCheckRunning;
    if (deepCheckState === 'done') return copy.deepCheckDone;
    if (deepCheckState === 'failed') return copy.deepCheckFailed;
    if (benchmarkError) return copy.testFailed;
    if (benchmarkReady) return copy.testInstantDone;
    return copy.testRunning;
  })();

  function go(nextIndex: number) {
    setDirection(nextIndex > stepIndex ? 'next' : 'back');
    setStepIndex(Math.max(0, Math.min(STEPS.length - 1, nextIndex)));
  }

  async function handleDeepCheck() {
    if (deepCheckState === 'running') return;
    setDeepCheckState('running');
    const result = await runDeepOnboardingBenchmark();
    if (result) {
      setBenchmark(result);
      if (autoRecommend) setSelectedModel(result.recommendation.modelId);
      setDeepCheckState('done');
      return;
    }
    setDeepCheckState('failed');
  }

  async function persistSettings(skip = false, completeWelcome = true) {
    await props.onSave({
      uiLanguage,
      metadata: {
        ...props.settings.metadata,
        preferredLanguage: metadataLanguage,
        enableOnlineLookup: onlineCatalogEnabled,
      },
      uiSounds: {
        ...(props.settings.uiSounds ?? defaultUiSoundsSettings()),
        enabled: uiSoundsEnabled,
      },
      subtitles: skip
        ? { ...props.settings.subtitles, autoGenerate }
        : { ...props.settings.subtitles, autoGenerate, whisperModel: selectedModel },
      discovery: {
        ...props.settings.discovery,
        includeAdultContent,
        disableOnlineDiscovery: !onlineCatalogEnabled,
        enableOnlineCatalog: onlineCatalogEnabled,
        enableCatalogSearch: onlineCatalogEnabled,
        enableDiscoverCatalogRails: onlineCatalogEnabled,
      },
      onboarding: {
        ...props.settings.onboarding,
        welcomeCompleted: completeWelcome ? true : (props.settings.onboarding?.welcomeCompleted ?? false),
        completedAt: completeWelcome
          ? new Date().toISOString()
          : props.settings.onboarding?.completedAt,
        recommendedWhisperModel: recommendedId ?? selectedModel,
        benchmarkTier: tier,
        downloadedWhisperModel: downloadedModel ?? (selectedInstalled ? selectedModel : undefined),
      },
    });
  }

  async function markWelcomeComplete() {
    await props.onSave({
      onboarding: {
        ...props.settings.onboarding,
        welcomeCompleted: true,
        completedAt: new Date().toISOString(),
      },
    });
  }

  async function complete(skip = false) {
    setSaving(true);
    try {
      await persistSettings(skip);
      props.onComplete();
    } finally {
      setSaving(false);
    }
  }

  async function handleWelcomeStart() {
    if (saving || exiting) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      await complete(false);
      return;
    }

    const sourceEl = prismWordRef.current;
    const targetEl = document.querySelector('.title-bar-brand .title-bar-product');
    if (!sourceEl || !targetEl) {
      await complete(false);
      return;
    }

    setHoldOpen(true);
    setFinaleActive(true);

    setSaving(true);
    try {
      await persistSettings(false, false);
    } finally {
      setSaving(false);
    }

    const source = sourceEl.getBoundingClientRect();
    const target = targetEl.getBoundingClientRect();
    const sourceStyle = window.getComputedStyle(sourceEl);
    const sx = source.left + source.width / 2;
    const sy = source.top + source.height / 2;
    const tx = target.left + target.width / 2;
    const ty = target.top + target.height / 2;
    const scale = target.height / source.height;

    const appFrame = document.querySelector('.app-frame');
    appFrame?.classList.add('app-frame--onboarding-brand-flight');

    const flightDelayMs = 300;
    const flightDurationMs = 1400;

    setExitFlight({
      left: sx,
      top: sy,
      fontSize: sourceStyle.fontSize,
      letterSpacing: sourceStyle.letterSpacing,
      fontFamily: sourceStyle.fontFamily,
      fontWeight: sourceStyle.fontWeight,
      lineHeight: sourceStyle.lineHeight,
      text: sourceEl.textContent?.trim() ?? copy.welcomePrism,
      flightTransform: `translate(calc(-50% + ${tx - sx}px), calc(-50% + ${ty - sy}px)) scale(${scale})`,
    });
    setFinaleDismissed(true);

    const finishExit = () => {
      const BRAND_REVEAL_MS = 1000;

      appFrame?.classList.remove('app-frame--onboarding-brand-flight');
      appFrame?.classList.add('app-frame--onboarding-brand-settled');
      appFrame?.classList.remove('app-frame--onboarding-welcome-preview');
      setFlightHandoff(true);

      if (uiSoundsEnabled) {
        configureUiAudio({
          ...(props.settings.uiSounds ?? defaultUiSoundsSettings()),
          enabled: true,
        });
        playUiSound('success');
      }

      window.requestAnimationFrame(() => {
        setExitFlight(null);
        window.requestAnimationFrame(() => {
          setExiting(false);
          setGlowLanding(false);
          setFlightHandoff(false);

          window.setTimeout(() => {
            void markWelcomeComplete().finally(() => {
              setFinaleActive(false);
              setHoldOpen(false);
              props.onComplete();
            });
          }, BRAND_REVEAL_MS);
        });
      });
    };

    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setExiting(true);
        });
      });
    }, flightDelayMs);

    window.setTimeout(() => {
      setGlowLanding(true);
    }, flightDelayMs + flightDurationMs - 320);

    window.setTimeout(finishExit, flightDelayMs + flightDurationMs + 140);
  }

  async function handleDownload() {
    startWhisperModelDownloadInBackground(selectedModel);
    go(importStepIndex);
  }

  async function handleCancelDownload() {
    await cancelWhisperDownload(selectedModel);
  }

  useEffect(() => {
    const frame = document.querySelector('.app-frame');
    if (!frame) return undefined;
    const showWelcomePreview = props.open && step.id === 'welcome' && !finaleActive && !finaleDismissed;
    if (showWelcomePreview) {
      frame.classList.add('app-frame--onboarding-welcome-preview');
    } else {
      frame.classList.remove('app-frame--onboarding-welcome-preview');
    }
    return () => frame.classList.remove('app-frame--onboarding-welcome-preview');
  }, [props.open, step.id, finaleActive, finaleDismissed]);

  useEffect(() => {
    void refreshInstalledWhisperModels();
  }, [props.open, step.id]);

  useEffect(() => {
    if (!props.open || step.id !== 'model') return;
    if (modelDownload?.status === 'complete' && modelDownload.modelId) {
      setDownloadedModel(modelDownload.modelId);
    }
  }, [props.open, step.id, modelDownload?.status, modelDownload?.modelId]);

  const downloadStatusText = (() => {
    if (!downloadProgress) return '';
    if (downloadProgress.status === 'complete') return copy.modelReady;
    if (downloadProgress.status === 'cancelled') return copy.downloadStopped;
    if (downloadProgress.status === 'starting') return copy.downloadPreparing;
    return copy.downloading(downloadPercent);
  })();

  const downloadSizeText = (() => {
    if (!downloadProgress) return '';
    const total = downloadProgress.totalBytes ?? selectedCard.estimatedSizeMb * 1024 * 1024;
    return `${formatSizeLabel(downloadProgress.downloadedBytes, selectedCard.estimatedSizeMb)} / ${formatSizeLabel(total, selectedCard.estimatedSizeMb)}`;
  })();

  const isWelcomePreview = props.open && step.id === 'welcome' && !finaleActive && !finaleDismissed;
  const wizardOpen = props.open || holdOpen;
  const overlayClass = [
    'prism-onboarding',
    isWelcomePreview ? 'prism-onboarding--welcome-preview' : '',
    finaleActive || finaleDismissed ? 'prism-onboarding--flight' : '',
    exiting ? 'prism-onboarding--exiting' : '',
    finaleDismissed ? 'prism-onboarding--finale-dismissed' : '',
  ].filter(Boolean).join(' ');
  const panelClass = [
    'prism-onboarding__panel',
    step.id === 'welcome' ? 'prism-onboarding__panel--finale' : '',
    finaleActive || finaleDismissed ? 'prism-onboarding__panel--exiting' : '',
  ].filter(Boolean).join(' ');

  return (
    <ModalAnimatedPresence
      open={wizardOpen}
      exitDurationMs={0}
      className={overlayClass}
      panelClassName={panelClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prism-onboarding-title"
    >
      <div className="prism-onboarding__ambient" aria-hidden="true" />
      <div className="prism-onboarding__topline">
        <span className="eyebrow">{copy.brand}</span>
        <div className="prism-onboarding__steps" aria-label={copy.stepsAria}>
          {STEPS.map((item, index) => (
            <span
              key={item.id}
              className={[
                'prism-onboarding__dot',
                index === stepIndex ? 'is-active' : '',
                index < stepIndex ? 'is-done' : '',
              ].filter(Boolean).join(' ')}
            />
          ))}
        </div>
      </div>

      <div className="prism-onboarding__body">
        <section
          className={`prism-onboarding__slide prism-onboarding__slide--${direction}`}
          key={step.id}
        >
          {step.id === 'language' && (
            <div className="prism-onboarding__content">
              <p className="eyebrow">{copy.languageEyebrow}</p>
              <h1 id="prism-onboarding-title">{copy.languageTitle}</h1>
              <p>{copy.languageHint}</p>
              <div className="prism-onboarding__language-grid">
                {([
                  ['auto', copy.languageAuto, copy.languageAutoHint],
                  ['en', copy.languageEn, copy.languageEnHint],
                  ['ru', copy.languageRu, copy.languageRuHint],
                ] as const).map(([value, title, hint]) => (
                  <button
                    key={value}
                    type="button"
                    className={[
                      'prism-onboarding__language-card',
                      uiLanguage === value ? 'is-selected' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setUiLanguage(value)}
                  >
                    <strong>{title}</strong>
                    <span>{hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step.id === 'metadata' && (
            <div className="prism-onboarding__content">
              <p className="eyebrow">{copy.metadataEyebrow}</p>
              <h1 id="prism-onboarding-title">{copy.metadataTitle}</h1>
              <p>{copy.metadataBody}</p>
              <div className="prism-onboarding__language-grid">
                {([
                  ['auto', copy.metadataAuto, copy.metadataAutoHint],
                  ['en', copy.metadataEn, copy.metadataEnHint],
                  ['ru', copy.metadataRu, copy.metadataRuHint],
                ] as const).map(([value, title, hint]) => (
                  <button
                    key={value}
                    type="button"
                    className={[
                      'prism-onboarding__language-card',
                      metadataLanguage === value ? 'is-selected' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setMetadataLanguage(value)}
                  >
                    <strong>{title}</strong>
                    <span>{hint}</span>
                  </button>
                ))}
              </div>
              <p className="prism-onboarding__hint">{copy.metadataHint}</p>
            </div>
          )}

          {step.id === 'library' && (
            <div className="prism-onboarding__content">
              <p className="eyebrow">{copy.basicsEyebrow}</p>
              <h2>{copy.basicsTitle}</h2>
              <p>{copy.basicsBody}</p>
              <div className="prism-onboarding__toggle glass-inset">
                <span>
                  <strong>{copy.smartSubtitles}</strong>
                  <small>{copy.smartSubtitlesHint}</small>
                </span>
                <PrismToggle
                  checked={autoGenerate}
                  onCheckedChange={setAutoGenerate}
                  aria-label={copy.smartSubtitles}
                />
              </div>
              <div className="prism-onboarding__toggle glass-inset">
                <span>
                  <strong>{copy.autoRecommend}</strong>
                  <small>{copy.autoRecommendHint}</small>
                </span>
                <PrismToggle
                  checked={autoRecommend}
                  onCheckedChange={setAutoRecommend}
                  aria-label={copy.autoRecommend}
                />
              </div>
              <div className="prism-onboarding__toggle glass-inset">
                <span>
                  <strong>{copy.uiSounds}</strong>
                  <small>{copy.uiSoundsHint}</small>
                </span>
                <PrismToggle
                  checked={uiSoundsEnabled}
                  onCheckedChange={setUiSoundsEnabled}
                  aria-label={copy.uiSounds}
                />
              </div>
            </div>
          )}

          {step.id === 'catalog' && (
            <div className="prism-onboarding__content">
              <p className="eyebrow">{copy.catalogEyebrow}</p>
              <h2>{copy.catalogTitle}</h2>
              <p>{copy.catalogBody}</p>
              <div className="prism-onboarding__language-grid">
                {([
                  [false, copy.catalogChoiceHidden, copy.catalogChoiceHiddenHint],
                  [true, copy.catalogChoiceShow, copy.catalogChoiceShowHint],
                ] as const).map(([value, title, hint]) => (
                  <button
                    key={value ? 'show' : 'hide'}
                    type="button"
                    className={[
                      'prism-onboarding__language-card',
                      includeAdultContent === value ? 'is-selected' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setIncludeAdultContent(value)}
                  >
                    <strong>{title}</strong>
                    <span>{hint}</span>
                  </button>
                ))}
              </div>
              <p className="prism-onboarding__hint">{copy.catalogHint}</p>
            </div>
          )}

          {step.id === 'online' && (
            <div className="prism-onboarding__content">
              <p className="eyebrow">{copy.onlineEyebrow}</p>
              <h2>{copy.onlineTitle}</h2>
              <p>{copy.onlineBody}</p>
              <div className="prism-onboarding__language-grid">
                {([
                  [true, copy.onlineChoiceCatalog, copy.onlineChoiceCatalogHint],
                  [false, copy.onlineChoiceLocal, copy.onlineChoiceLocalHint],
                ] as const).map(([value, title, hint]) => (
                  <button
                    key={value ? 'online' : 'local'}
                    type="button"
                    className={[
                      'prism-onboarding__language-card',
                      onlineCatalogEnabled === value ? 'is-selected' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setOnlineCatalogEnabled(value)}
                  >
                    <strong>{title}</strong>
                    <span>{hint}</span>
                  </button>
                ))}
              </div>
              <p className="prism-onboarding__hint">{copy.onlineHint}</p>
            </div>
          )}

          {step.id === 'test' && (
            <div className="prism-onboarding__content">
              <p className="eyebrow">{copy.testEyebrow}</p>
              <h2>{copy.testTitle}</h2>
              <div className="prism-onboarding__meter glass-inset">
                <div className="prism-onboarding__meter-line">
                  <span>{progressLabel}</span>
                  <strong>
                    {benchmark?.benchmark.threadCount
                      ? copy.threads(benchmark.benchmark.threadCount)
                      : '…'}
                  </strong>
                </div>
                <div className={`prism-onboarding__bar${benchmarkReady && deepCheckState !== 'running' ? '' : ' is-indeterminate'}`}>
                  <span style={benchmarkReady && deepCheckState !== 'running' ? { width: '100%' } : undefined} />
                </div>
                <p className="prism-onboarding__meter-copy">
                  {autoRecommend ? recommendationText : copy.testManualBody}
                </p>
                {autoRecommend && (
                  <p className="prism-onboarding__meter-note">{testDetailText}</p>
                )}
              </div>
              {autoRecommend && (
                <div className="prism-onboarding__test-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={deepCheckState === 'running'}
                    onClick={() => void handleDeepCheck()}
                  >
                    {copy.runDeepCheck}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => go(STEPS.findIndex((s) => s.id === 'model'))}
                  >
                    {copy.testSkip}
                  </button>
                </div>
              )}
            </div>
          )}

          {step.id === 'model' && (
            <div className="prism-onboarding__content prism-onboarding__content--wide">
              <p className="eyebrow">{copy.modelEyebrow}</p>
              <h2>{copy.modelTitle}</h2>
              <p>{copy.modelHint}</p>
              <div className="prism-onboarding__models">
                {modelCards.map((model) => (
                  <button
                    type="button"
                    key={model.id}
                    className={[
                      'prism-onboarding__model-card',
                      selectedModel === model.id ? 'is-selected' : '',
                      model.recommended ? 'is-recommended' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setSelectedModel(model.id)}
                  >
                    {model.recommended && (
                      <span className="prism-onboarding__model-badge">{copy.recommended}</span>
                    )}
                    <span className="prism-onboarding__model-title">{model.label}</span>
                    <span className="prism-onboarding__model-desc">{model.description}</span>
                    <small>
                      {model.installed
                        ? copy.installed
                        : formatSizeLabel(undefined, model.estimatedSizeMb)}
                    </small>
                    <span className="prism-onboarding__model-detail" role="tooltip">
                      {model.detail}
                    </span>
                  </button>
                ))}
              </div>
              <div className="prism-onboarding__model-footer">
                {downloadError && <p className="prism-onboarding__error">{downloadError}</p>}
                <div
                  className={[
                    'prism-onboarding__download',
                    'glass-inset',
                    downloadProgress ? 'is-visible' : '',
                  ].filter(Boolean).join(' ')}
                  aria-hidden={!downloadProgress}
                >
                  <span>{downloadStatusText || '\u00a0'}</span>
                  <small>{downloadSizeText || '\u00a0'}</small>
                  <div className="prism-onboarding__bar">
                    <span style={{ width: `${downloadPercent}%` }} />
                  </div>
                  {isDownloading && (
                    <button
                      type="button"
                      className="ghost-button prism-onboarding__cancel-btn"
                      onClick={() => void handleCancelDownload()}
                    >
                      {copy.cancelDownload}
                    </button>
                  )}
                </div>
                {recommendedId && selectedModel !== recommendedId && (
                  <p className="prism-onboarding__hint">
                    {copy.recommendedOverride(getOnboardingModelCopy(copy, recommendedId).label)}
                  </p>
                )}
              </div>
            </div>
          )}

          {step.id === 'import' && (
            <div className="prism-onboarding__content">
              <p className="eyebrow">{copy.importEyebrow}</p>
              <h2>{copy.importTitle}</h2>
              <p>{copy.importBody}</p>
              {hasLibraryFolders && (
                <p className="prism-onboarding__hint">{copy.importAlreadyAdded}</p>
              )}
              {props.onImportFolder && (
                <button
                  type="button"
                  className="primary-action primary-action--shimmer prism-onboarding__import-btn"
                  onClick={() => props.onImportFolder?.()}
                >
                  <span>{copy.importChooseFolder}</span>
                </button>
              )}
              <p className="prism-onboarding__hint">{copy.importHint}</p>
            </div>
          )}

          {step.id === 'welcome' && (
            <div className="prism-onboarding__welcome-finale">
              <p className="eyebrow">{copy.finishEyebrow}</p>
              <p className="prism-onboarding__welcome-prelude">{copy.welcomePrelude}</p>
              <span
                ref={prismWordRef}
                className={[
                  'prism-onboarding__prism-word',
                  'prism-onboarding__prism-word--breathe',
                  exitFlight || finaleDismissed ? 'is-hidden' : '',
                ].filter(Boolean).join(' ')}
              >
                {copy.welcomePrism}
              </span>
              <p className="prism-onboarding__welcome-sub">{copy.finishBody(selectedCard.label)}</p>
            </div>
          )}
        </section>
      </div>

      <div className="prism-onboarding__actions">
        <button
          type="button"
          className="ghost-button"
          disabled={saving || stepIndex === 0 || exiting}
          onClick={() => go(stepIndex - 1)}
        >
          {copy.back}
        </button>
        {step.id !== 'welcome' && (
          <button
            type="button"
            className="ghost-button"
            disabled={saving || exiting}
            onClick={() => (step.id === 'import' ? go(welcomeStepIndex) : void complete(true))}
          >
            {step.id === 'import' ? copy.importSkipForNow : copy.skip}
          </button>
        )}
        {step.id === 'model' ? (
          <button
            type="button"
            className="primary-action primary-action--shimmer"
            disabled={saving}
            onClick={() => (
              selectedInstalled || isDownloading
                ? go(importStepIndex)
                : void handleDownload()
            )}
          >
            <span>
              {selectedInstalled || isDownloading
                ? copy.continueBtn
                : downloadProgress?.status === 'cancelled'
                  ? copy.retryDownload
                  : copy.downloadContinue}
            </span>
          </button>
        ) : step.id === 'import' ? (
          <button
            type="button"
            className="primary-action primary-action--shimmer"
            disabled={saving}
            onClick={() => go(welcomeStepIndex)}
          >
            <span>{copy.continueBtn}</span>
          </button>
        ) : step.id === 'welcome' ? (
          <button
            type="button"
            className="primary-action primary-action--shimmer"
            disabled={saving || exiting}
            onClick={() => void handleWelcomeStart()}
          >
            <span>{props.mode === 'manual' ? copy.save : copy.start}</span>
          </button>
        ) : (
          <button
            type="button"
            className="primary-action primary-action--shimmer"
            disabled={saving || (step.id === 'test' && deepCheckState === 'running')}
            onClick={() => go(stepIndex + 1)}
          >
            <span>{copy.next}</span>
          </button>
        )}
      </div>

      {exitFlight && typeof document !== 'undefined' && createPortal(
        <div
          className={[
            'prism-onboarding-exit__flight',
            exiting ? 'is-flying' : '',
            glowLanding || flightHandoff ? 'is-landed' : '',
            flightHandoff ? 'is-handoff' : '',
          ].filter(Boolean).join(' ')}
          style={{
            left: exitFlight.left,
            top: exitFlight.top,
            transform: exiting ? exitFlight.flightTransform : 'translate(-50%, -50%)',
          }}
          aria-hidden="true"
        >
          <span
            className="prism-onboarding-exit__trail-ghost is-ghost-3"
            style={{
              fontSize: exitFlight.fontSize,
              letterSpacing: exitFlight.letterSpacing,
              fontFamily: exitFlight.fontFamily,
              fontWeight: exitFlight.fontWeight,
              lineHeight: exitFlight.lineHeight,
            }}
          >
            {exitFlight.text}
          </span>
          <span
            className="prism-onboarding-exit__trail-ghost is-ghost-2"
            style={{
              fontSize: exitFlight.fontSize,
              letterSpacing: exitFlight.letterSpacing,
              fontFamily: exitFlight.fontFamily,
              fontWeight: exitFlight.fontWeight,
              lineHeight: exitFlight.lineHeight,
            }}
          >
            {exitFlight.text}
          </span>
          <span
            className="prism-onboarding-exit__trail-ghost is-ghost-1"
            style={{
              fontSize: exitFlight.fontSize,
              letterSpacing: exitFlight.letterSpacing,
              fontFamily: exitFlight.fontFamily,
              fontWeight: exitFlight.fontWeight,
              lineHeight: exitFlight.lineHeight,
            }}
          >
            {exitFlight.text}
          </span>
          <span
            className={[
              'prism-onboarding-exit__prism',
              exiting && !glowLanding && !flightHandoff ? 'is-glowing is-breathing' : '',
            ].filter(Boolean).join(' ')}
            style={{
              fontSize: exitFlight.fontSize,
              letterSpacing: exitFlight.letterSpacing,
              fontFamily: exitFlight.fontFamily,
              fontWeight: exitFlight.fontWeight,
              lineHeight: exitFlight.lineHeight,
            }}
          >
            {exitFlight.text}
          </span>
        </div>,
        document.body
      )}
    </ModalAnimatedPresence>
  );
}
