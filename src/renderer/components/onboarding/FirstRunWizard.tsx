import { useEffect, useMemo, useState } from 'react';
import type { AppSettings, UiLanguagePreference } from '../../../shared/types';
import type { WhisperModelSize } from '../../../shared/subtitleTypes';
import type { FirstRunSetupBenchmarkResult } from '../../lib/tauriCommands';
import {
  cancelWhisperModelDownload,
  downloadWhisperModel,
  onSetupDownloadProgress,
  type SetupDownloadProgress,
} from '../../lib/tauriCommands';
import {
  benchmarkTierKey,
  fallbackRecommendedModel,
  getCachedOnboardingBenchmark,
  loadOnboardingBenchmark,
  prefetchOnboardingBenchmark,
  runDeepOnboardingBenchmark,
} from './onboardingBenchmark';
import { ModalAnimatedPresence } from '../AnimatedPresence';
import {
  getOnboardingCopy,
  getOnboardingModelCopy,
  getRecommendationCopy,
  resolveOnboardingLang,
  type OnboardingModelId,
} from './onboardingCopy';

type WizardMode = 'first-run' | 'manual';
type StepId = 'language' | 'welcome' | 'library' | 'test' | 'model' | 'finish';

const MODEL_IDS: OnboardingModelId[] = ['base', 'small', 'medium', 'large-v3'];

const STEPS: Array<{ id: StepId }> = [
  { id: 'language' },
  { id: 'welcome' },
  { id: 'library' },
  { id: 'test' },
  { id: 'model' },
  { id: 'finish' },
];

interface FirstRunWizardProps {
  open: boolean;
  mode?: WizardMode;
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => Promise<unknown> | void;
  onComplete: () => void;
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
  const [downloadProgress, setDownloadProgress] = useState<SetupDownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloadedModel, setDownloadedModel] = useState<WhisperModelSize | null>(null);

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
    setDownloadProgress(null);
    setDownloadError(null);
    setDownloadedModel(null);
    setUiLanguage(props.settings.uiLanguage ?? 'auto');
    setAutoGenerate(props.settings.subtitles.autoGenerate ?? true);
    setIncludeAdultContent(props.settings.discovery?.includeAdultContent ?? false);
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

  useEffect(() => {
    if (!props.open) return;
    let unlisten: (() => void) | undefined;
    void onSetupDownloadProgress((progress) => {
      if (progress.modelId === selectedModel) setDownloadProgress(progress);
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => {
      unlisten?.();
    };
  }, [props.open, selectedModel]);

  const step = STEPS[stepIndex];
  const recommendedId = autoRecommend ? benchmark?.recommendation.modelId : undefined;
  const installedIds = new Set(benchmark?.resources.installedModels ?? []);
  if (downloadedModel) installedIds.add(downloadedModel);

  const modelCards = MODEL_IDS.map((id) => {
    const meta = copy.models[id];
    const backend = benchmark?.models.find((m) => m.id === id);
    return {
      id,
      label: meta.label,
      description: meta.description,
      detail: meta.detail,
      estimatedSizeMb: backend?.estimatedSizeMb ?? (
        id === 'base' ? 150 : id === 'small' ? 466 : id === 'medium' ? 1530 : 3090
      ),
      installed: installedIds.has(id),
      recommended: recommendedId === id,
    };
  });

  const selectedCard = modelCards.find((m) => m.id === selectedModel) ?? modelCards[0];
  const selectedInstalled = selectedCard.installed;
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

  async function complete(skip = false) {
    setSaving(true);
    try {
      await props.onSave({
        uiLanguage,
        subtitles: skip
          ? { ...props.settings.subtitles, autoGenerate }
          : { ...props.settings.subtitles, autoGenerate, whisperModel: selectedModel },
        discovery: {
          ...props.settings.discovery,
          includeAdultContent,
        },
        onboarding: {
          ...props.settings.onboarding,
          welcomeCompleted: true,
          completedAt: new Date().toISOString(),
          recommendedWhisperModel: recommendedId ?? selectedModel,
          benchmarkTier: tier,
          downloadedWhisperModel: downloadedModel ?? (selectedInstalled ? selectedModel : undefined),
        },
      });
      props.onComplete();
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    setDownloadError(null);
    setDownloadProgress({
      modelId: selectedModel,
      downloadedBytes: 0,
      progress: 0,
      status: 'starting',
    });
    try {
      const result = await downloadWhisperModel(selectedModel);
      setDownloadedModel(result.modelId);
      setDownloadProgress({
        modelId: result.modelId,
        downloadedBytes: result.bytes,
        totalBytes: result.bytes,
        progress: 1,
        status: 'complete',
      });
      go(STEPS.findIndex((s) => s.id === 'finish'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('download_cancelled')) {
        setDownloadProgress((current) => (current ? { ...current, status: 'cancelled' } : current));
      } else {
        setDownloadError(message);
      }
    }
  }

  async function handleCancelDownload() {
    await cancelWhisperModelDownload(selectedModel);
    setDownloadProgress((current) => (current ? { ...current, status: 'cancelled' } : current));
  }

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

  return (
    <ModalAnimatedPresence
      open={props.open}
      className="prism-onboarding"
      panelClassName="prism-onboarding__panel"
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

          {step.id === 'welcome' && (
            <div className="prism-onboarding__hero">
              <p className="eyebrow">{copy.welcomeEyebrow}</p>
              <h2>{copy.welcomeTitle}</h2>
              <p>{copy.welcomeBody}</p>
              <div className="prism-onboarding__status glass-inset">
                <span>{progressLabel}</span>
                <strong>{autoRecommend ? recommendedLabel : copy.benchmarkManual}</strong>
              </div>
            </div>
          )}

          {step.id === 'library' && (
            <div className="prism-onboarding__content">
              <p className="eyebrow">{copy.basicsEyebrow}</p>
              <h2>{copy.basicsTitle}</h2>
              <p>{copy.basicsBody}</p>
              <label className="prism-onboarding__toggle glass-inset">
                <span>
                  <strong>{copy.smartSubtitles}</strong>
                  <small>{copy.smartSubtitlesHint}</small>
                </span>
                <input
                  type="checkbox"
                  checked={autoGenerate}
                  onChange={(event) => setAutoGenerate(event.target.checked)}
                />
              </label>
              <label className="prism-onboarding__toggle glass-inset">
                <span>
                  <strong>{copy.autoRecommend}</strong>
                  <small>{copy.autoRecommendHint}</small>
                </span>
                <input
                  type="checkbox"
                  checked={autoRecommend}
                  onChange={(event) => setAutoRecommend(event.target.checked)}
                />
              </label>
              <h3>{copy.adultContentTitle}</h3>
              <p>{copy.adultContentBody}</p>
              <p className="prism-onboarding__hint">{copy.adultContentHint}</p>
              <label className="prism-onboarding__toggle glass-inset">
                <span>
                  <strong>{copy.adultContentToggle}</strong>
                </span>
                <input
                  type="checkbox"
                  checked={includeAdultContent}
                  onChange={(event) => setIncludeAdultContent(event.target.checked)}
                />
              </label>
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

          {step.id === 'finish' && (
            <div className="prism-onboarding__hero">
              <p className="eyebrow">{copy.finishEyebrow}</p>
              <h2>{copy.finishTitle}</h2>
              <p>{copy.finishBody(selectedCard.label)}</p>
            </div>
          )}
        </section>
      </div>

      <div className="prism-onboarding__actions">
        <button
          type="button"
          className="ghost-button"
          disabled={saving || stepIndex === 0}
          onClick={() => go(stepIndex - 1)}
        >
          {copy.back}
        </button>
        <button
          type="button"
          className="ghost-button"
          disabled={saving || isDownloading}
          onClick={() => void complete(true)}
        >
          {copy.skip}
        </button>
        {step.id === 'model' ? (
          <button
            type="button"
            className="primary-action primary-action--shimmer"
            disabled={saving || isDownloading}
            onClick={() => (selectedInstalled ? go(STEPS.findIndex((s) => s.id === 'finish')) : void handleDownload())}
          >
            <span>
              {selectedInstalled
                ? copy.continueBtn
                : downloadProgress?.status === 'cancelled'
                  ? copy.retryDownload
                  : copy.downloadContinue}
            </span>
          </button>
        ) : step.id === 'finish' ? (
          <button
            type="button"
            className="primary-action primary-action--shimmer"
            disabled={saving}
            onClick={() => void complete(false)}
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
    </ModalAnimatedPresence>
  );
}
