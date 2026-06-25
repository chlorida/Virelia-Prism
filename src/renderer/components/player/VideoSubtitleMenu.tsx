import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

import { useI18n } from '../../i18n/I18nProvider';

import { formatSubtitleMenuLabel } from '../../features/subtitles/subtitleSelection';
import { isValidGeneratedTrack } from '../../features/subtitles/subtitleCueQuality';
import {
  formatTrackInvalidMessage,
  resolveTrackStatus,
  shouldShowGlobalPlaybackError,
} from '../../features/subtitles/subtitleTrackStatus';
import { buildSubtitleMenuModel } from '../../features/subtitles/subtitleMenuModel';
import { filterTracksForVideo } from '../../features/subtitles/subtitleScope';
import {
  getTranslationActionUi,
  subtitleFileName,
} from '../../features/subtitles/subtitleTranslationUi';

import type { VideoSubtitlesState } from '../../features/subtitles/useVideoSubtitles';

import {
  SUBTITLE_SOURCE_LANGUAGE_OPTIONS,
  SUBTITLE_TARGET_LANGUAGE_OPTIONS,
} from '../../../shared/subtitleTypes';

import type { SourceAudioLanguage, TargetSubtitleLanguage } from '../../../shared/subtitleTypes';

import { SpeakerColorPanel } from '../../features/subtitles/SpeakerColorPanel';
import {
  isAnimeMediaPath,
  isUsingJapaneseAnimeHint,
  whisperModelQualityHint,
} from '../../features/subtitles/subtitleGenerationDiagnostics';
import { useStore } from '../../lib/useStore';
import { settingsStore } from '../../features/settings/settingsStore';
import { resolveCueSpeaker } from '../../features/subtitles/subtitleCueColors';
import { getSubtitleDebugSnapshot } from '../../features/subtitles/subtitleDebug';
import { formatDuration } from '../../lib/search';
import type { SubtitleTrack } from '../../../shared/subtitleTypes';
import { IconCaptions, IconFileImport, IconSparkGenerate } from './PlayerIcons';
import { PlayerFeatureChip } from './PlayerFeatureChip';
import { useOptionalPlayerPopover } from './playerPopoverContext';
import { usePlayerSheetPortal } from './usePlayerSheetPortal';



type MenuView = 'main' | 'targetLanguage' | 'sourceLanguage';

function languageBadge(code: string | undefined): string {
  if (!code || code === 'und') return '?';
  return code.toUpperCase().slice(0, 2);
}

function compactTrackTitle(track: SubtitleTrack): string {
  if (track.label) {
    const commaTail = track.label.split(',').pop()?.trim();
    if (commaTail) return commaTail;
    const dashTail = track.label.split('—').pop()?.trim();
    if (dashTail) return dashTail;
  }
  return track.languageLabel;
}

function trackKindLabel(track: SubtitleTrack): string {
  if (track.source === 'embedded') return 'EMB';
  if (track.source === 'generated') return 'GEN';
  return 'EXT';
}



interface VideoSubtitleMenuProps {

  disabled?: boolean;

  subtitles: VideoSubtitlesState;

}



function detectFranchiseKey(videoPath: string | null): string | undefined {
  if (!videoPath) return undefined;
  const lower = videoPath.toLowerCase();
  if (lower.includes('sonic')) return 'sonic';
  if (lower.includes('higurashi') || lower.includes('when they cry')) return 'higurashi';
  return undefined;
}

export function VideoSubtitleMenu(props: VideoSubtitleMenuProps) {

  const { t } = useI18n();
  const appSettings = useStore(settingsStore, (state) => state.settings);

  const menuId = useId();

  const buttonRef = useRef<HTMLButtonElement>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  const [localOpen, setLocalOpen] = useState(false);

  const [view, setView] = useState<MenuView>('main');

  const [showGenDetails, setShowGenDetails] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [colorSpeakerName, setColorSpeakerName] = useState('');

  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0 });



  const {

    subtitleState,

    selectTrack,

    useLiveSubtitles,

    setTargetSubtitleLanguage,

    setSourceAudioLanguage,

    setMarkForeignSpeech,

    cancelGeneration,

    generate,

    translateExisting,

    generateFromAudio,

    deleteGenerated,

    importSubtitle,

    setSelectedAudioStreamIndex,

    setShowSoundLabels,

    setNameStyle,

    ffmpegStatus,

    generationDetail,

    translationBackend,

    logSubtitleDebug,

    jumpToFirstSubtitle,

    forceShowSubtitleTest,

    generationProgressDetail,

  } = props.subtitles;



  const {

    availableTracks,

    selectedTrackId,

    targetSubtitleLanguage,

    sourceAudioLanguage,

    markForeignSpeech,

    showSoundLabels,

    nameStyle,

    translationAvailable,

    generationAvailability,

    generationStatus,

    generationProgress,

    generationMessage,

    generationError,

    generationErrorDetails,

    generationDiagnostics,

    availableAudioStreams = [],

    selectedAudioStreamIndex,

    playbackError,

    playbackErrorKind,

    playbackErrorDetails,

    playbackErrorTrackId,

    videoKey,

    videoPath,

    loading,

    externalScanStatus,

    selectionWarning,

    userDisabledLiveSubtitles,

  } = subtitleState;

  const whisperModel = appSettings?.subtitles.whisperModel ?? 'base';
  const animePath = isAnimeMediaPath(videoPath);
  const usingJapaneseHint = isUsingJapaneseAnimeHint(sourceAudioLanguage, videoPath);
  const modelQualityWarning = whisperModelQualityHint(whisperModel, animePath || usingJapaneseHint);

  const scopedTracks = filterTracksForVideo(availableTracks, videoKey);
  const menuModel = buildSubtitleMenuModel(
    scopedTracks,
    targetSubtitleLanguage,
    translationAvailable === true
  );
  const {
    availableTracks: selectableTracks,
    invalidGenerated,
    hasTrackInOutputLanguage,
    showTranslateButton,
    displaySourceTrack,
    sourceTrackForTranslation,
  } = menuModel;
  const translationAction = getTranslationActionUi(
    translationBackend ?? 'disabled',
    translationAvailable === true,
    showTranslateButton,
  );
  const sourceLanguageNameForTrack = sourceTrackForTranslation?.languageLabel
    ?? displaySourceTrack?.languageLabel
    ?? sourceTrackForTranslation?.language
    ?? displaySourceTrack?.language
    ?? '';
  const sourceFileName = subtitleFileName(
    sourceTrackForTranslation?.path ?? displaySourceTrack?.path ?? null
  );
  const selectedTrack = scopedTracks.find((tr) => tr.id === selectedTrackId) ?? null;
  const showActivePlaybackError = shouldShowGlobalPlaybackError({
    playbackError,
    playbackErrorKind,
    playbackErrorTrackId,
    selectedTrackId,
    selectedTrack,
  });

  const isGenerating = (
    generationStatus === 'running'
    || generationStatus === 'queued'
    || generationStatus === 'preparing'
    || generationStatus === 'extracting_audio'
    || generationStatus === 'transcribing'
    || generationStatus === 'translating'
    || generationStatus === 'writing'
    || generationStatus === 'validating'
    || generationStatus === 'partial_ready'
  );

  const recoveredPartial = scopedTracks.find(
    (tr) => tr.isPartial && tr.recoveredFromFailure && isValidGeneratedTrack(tr)
  );

  const livePartialTrack = scopedTracks.find(
    (tr) => tr.isPartial && tr.isLiveUpdating && isValidGeneratedTrack(tr)
  );

  const popover = useOptionalPlayerPopover();
  const open = popover ? popover.isOpen('subtitles') : localOpen;
  const { mounted: menuMounted, sheetPhaseClass } = usePlayerSheetPortal(open);

  const hasTracks = scopedTracks.length > 0;
  const isLoadingSubtitles = loading || externalScanStatus === 'scanning';

  const canGenerate = generationAvailability === 'ready';



  const targetLanguageLabel = SUBTITLE_TARGET_LANGUAGE_OPTIONS.find((o) => o.value === targetSubtitleLanguage);

  const sourceLanguageLabel = SUBTITLE_SOURCE_LANGUAGE_OPTIONS.find((o) => o.value === sourceAudioLanguage);

  const targetLanguageName = targetLanguageLabel
    ? t(targetLanguageLabel.labelKey as Parameters<typeof t>[0])
    : targetSubtitleLanguage;

  const sourceLanguageName = sourceLanguageLabel
    ? t(sourceLanguageLabel.labelKey as Parameters<typeof t>[0])
    : sourceAudioLanguage;



  const generationHint = (() => {

    if (canGenerate) return null;

    if (generationAvailability === 'unavailable_no_model') {
      return t('subtitles.generationModelMissing', {
        model: generationDetail?.whisperModelName ?? whisperModel,
      });
    }

    if (generationAvailability === 'unavailable_no_backend') {
      if (generationDetail?.ffmpegAvailable && !generationDetail?.whisperCliAvailable) {
        return t('subtitles.generationNeedsWhisper');
      }
      return t('subtitles.generationNoBackend');
    }

    return t('subtitles.generationUnavailable');

  })();



  const setOpenState = useCallback((next: boolean) => {

    if (popover) {
      if (next) popover.open('subtitles');
      else popover.close();
    } else {
      setLocalOpen(next);
    }

    if (!next) {

      setView('main');

      setShowGenDetails(false);

      setShowAdvanced(false);

    }

  }, [popover]);



  const updatePosition = useCallback(() => {

    const button = buttonRef.current;

    if (!button) return;

    const rect = button.getBoundingClientRect();

    setMenuStyle({ top: rect.top, left: rect.right });

  }, []);



  useLayoutEffect(() => {

    if (!menuMounted) return;

    updatePosition();

  }, [menuMounted, view, updatePosition, availableTracks.length, generationStatus, showGenDetails, showAdvanced, sheetPhaseClass]);



  useEffect(() => {

    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {

      const target = event.target as Node;

      if (buttonRef.current?.contains(target)) return;

      if (menuRef.current?.contains(target)) return;

      setOpenState(false);

    };

    const onEscape = (event: KeyboardEvent) => {

      if (event.key === 'Escape') {

        event.stopPropagation();

        if (view !== 'main') setView('main');

        else setOpenState(false);

      }

    };

    document.addEventListener('mousedown', onPointerDown);

    document.addEventListener('keydown', onEscape);

    return () => {

      document.removeEventListener('mousedown', onPointerDown);

      document.removeEventListener('keydown', onEscape);

    };

  }, [open, setOpenState, view]);



  const renderSelectableTrack = (track: typeof availableTracks[number]) => {
    const status = resolveTrackStatus(track);
    if (!isValidGeneratedTrack(track) || status === 'invalid') return null;
    const active = selectedTrackId === track.id;
    return (
      <button
        key={track.id}
        type="button"
        role="menuitemradio"
        aria-checked={active}
        className={`player-subtitle-menu__track${active ? ' is-active' : ''}`}
        onClick={() => { selectTrack(track.id); }}
      >
        <span className="player-subtitle-menu__track-badge">{languageBadge(track.language)}</span>
        <span className="player-subtitle-menu__track-body">
          <span className="player-subtitle-menu__track-title">{compactTrackTitle(track)}</span>
          <span className="player-subtitle-menu__track-meta">{trackKindLabel(track)}</span>
        </span>
        {active ? <span className="player-subtitle-menu__track-check" aria-hidden>✓</span> : null}
        {status === 'failed' && track.error ? (
          <span className="player-subtitle-menu__track-warn" title={track.error}>!</span>
        ) : null}
      </button>
    );
  };



  const mainMenu = (

    <>

      <header className="player-subtitle-menu__head">

        <span className="player-subtitle-menu__head-icon" aria-hidden><IconCaptions width={18} height={18} /></span>

        <div className="player-subtitle-menu__head-copy">

          <strong>{t('player.subtitles')}</strong>

          {isGenerating ? <span className="player-subtitle-menu__head-status">{t('subtitles.generating')}</span> : null}

        </div>

        {selectedTrack ? (
          <span className="player-subtitle-menu__head-lang">{languageBadge(selectedTrack.language)}</span>
        ) : null}

      </header>



      {isGenerating && (

        <div className="player-subtitle-menu__gen-bar">

          <div className="player-subtitle-menu__gen-bar-top">

            <span>{generationMessage ?? t('subtitles.generating')}</span>

            {generationProgressDetail?.generatedCueCount != null && (
              <span className="player-subtitle-menu__gen-count">
                {generationProgressDetail.generatedCueCount}
              </span>
            )}

          </div>

          {generationProgress != null && (
            <progress max={1} value={generationProgress} className="player-subtitle-menu__progress" />
          )}

          <button type="button" className="player-subtitle-menu__inline-action" onClick={() => cancelGeneration()}>
            {t('subtitles.cancel')}
          </button>

        </div>

      )}



      {selectionWarning && (
        <div className="player-subtitle-menu__banner player-subtitle-menu__banner--warn">{selectionWarning}</div>
      )}

      {showActivePlaybackError && (

        <div className="player-subtitle-menu__banner player-subtitle-menu__banner--error">

          <p>{playbackError}</p>

          {playbackErrorDetails && import.meta.env?.DEV && (
            <p className="player-subtitle-menu__banner-detail">{playbackErrorDetails}</p>
          )}

        </div>

      )}



      {generationError && (generationStatus === 'failed' || generationStatus === 'partial_ready') && (

        <div className={`player-subtitle-menu__banner${generationStatus === 'partial_ready' ? '' : ' player-subtitle-menu__banner--error'}`}>

          <p>
            {generationStatus === 'partial_ready'
              ? generationError
              : generationDiagnostics?.reason === 'repeated_hallucinated_text'
                ? t('subtitles.hallucinationStoppedRecovered')
                : generationError ?? t('subtitles.generationFailed')}
          </p>

          <div className="player-subtitle-menu__banner-actions">
            {recoveredPartial && (
              <button type="button" className="player-subtitle-menu__inline-action" onClick={() => selectTrack(recoveredPartial.id)}>
                {t('subtitles.useRecoveredSubtitles')}
              </button>
            )}
            <button
              type="button"
              className="player-subtitle-menu__inline-action"
              disabled={!canGenerate || isGenerating}
              onClick={() => { void generate(true); }}
            >
              {t('subtitles.regenerateSubtitles')}
            </button>
            {generationErrorDetails && (
              <button type="button" className="player-subtitle-menu__inline-action" onClick={() => setShowGenDetails((v) => !v)}>
                {t('subtitles.generationDetails')}
              </button>
            )}
          </div>

          {showGenDetails && generationErrorDetails && (
            <pre className="player-subtitle-menu__details">{generationErrorDetails}</pre>
          )}

        </div>

      )}



      {livePartialTrack && userDisabledLiveSubtitles && (
        <button
          type="button"
          className="player-subtitle-menu__link"
          onClick={() => { useLiveSubtitles(); }}
        >
          {t('subtitles.useLiveSubtitles')}
        </button>
      )}

      {livePartialTrack && isGenerating && (
        <p className="player-subtitle-menu__hint">
          {t('subtitles.liveTrackStatus', {
            count: String(generationProgressDetail?.generatedCueCount ?? 0),
            language: livePartialTrack.languageLabel,
          })}
        </p>
      )}

      <div className="player-subtitle-menu__tracks">

        <button
          type="button"
          role="menuitemradio"
          aria-checked={!selectedTrackId}
          className={`player-subtitle-menu__track player-subtitle-menu__track--off${!selectedTrackId ? ' is-active' : ''}`}
          onClick={() => selectTrack(null)}
        >
          <span className="player-subtitle-menu__track-badge player-subtitle-menu__track-badge--muted">—</span>
          <span className="player-subtitle-menu__track-body">
            <span className="player-subtitle-menu__track-title">{t('subtitles.off')}</span>
          </span>
          {!selectedTrackId ? <span className="player-subtitle-menu__track-check" aria-hidden>✓</span> : null}
        </button>

        {isLoadingSubtitles && !isGenerating && (
          <p className="player-subtitle-menu__tracks-loading">{t('subtitles.loading')}</p>
        )}

        {selectableTracks.map(renderSelectableTrack)}

        {!hasTracks && !isGenerating && !isLoadingSubtitles && (
          <p className="player-subtitle-menu__empty">{t('subtitles.noneFound')}</p>
        )}

      </div>

      {invalidGenerated.length > 0 && (
        <>
          <span className="player-subtitle-menu__section-label">{t('subtitles.section.generated')}</span>
          {!hasTrackInOutputLanguage && invalidGenerated.some((tr) => tr.language === targetSubtitleLanguage) && (
            <p className="player-subtitle-menu__hint">
              {t('subtitles.noValidGeneratedForLanguage', { language: targetLanguageName })}
            </p>
          )}
          {invalidGenerated.map((track) => (
            <div key={track.id} className="player-subtitle-menu__hint-block">
              <p className="player-subtitle-menu__hint">
                {t('subtitles.invalidGeneratedLabel', { language: track.languageLabel })}
              </p>
              <p className="player-subtitle-menu__error">
                {t('subtitles.trackInvalid', { reason: formatTrackInvalidMessage(track, t) })}
              </p>
              <button
                type="button"
                className="player-subtitle-menu__link"
                disabled={!canGenerate || isGenerating}
                onClick={() => { void generate(true); }}
              >
                {t('subtitles.regenerateSubtitles')}
              </button>
              <button
                type="button"
                className="player-subtitle-menu__link"
                disabled={isGenerating}
                onClick={() => { void deleteGenerated(); }}
              >
                {t('subtitles.deleteGeneratedSubtitles')}
              </button>
            </div>
          ))}
        </>
      )}



      {(import.meta.env?.DEV || selectedTrackId) && (

        <>

          <button

            type="button"

            className="player-subtitle-menu__link"

            onClick={() => {

              const debug = logSubtitleDebug();

              setShowDebug((v) => !v);

              if (!showDebug) console.info('[Virelia subtitles] menu debug', debug);

            }}

          >

            {t('subtitles.debug')}

          </button>

          <button

            type="button"

            className="player-subtitle-menu__link"

            onClick={() => { jumpToFirstSubtitle(); }}

          >

            {t('subtitles.debugJumpFirst')}

          </button>

          <button

            type="button"

            className="player-subtitle-menu__link"

            onClick={() => { forceShowSubtitleTest(); }}

          >

            {t('subtitles.debugForceShow')}

          </button>

          {showDebug && (

            <pre className="player-subtitle-menu__details">

              {JSON.stringify(logSubtitleDebug(), null, 2)}

            </pre>

          )}

        </>

      )}



      <div className="player-subtitle-menu__toolbar">

        <button
          type="button"
          className="player-subtitle-menu__pill"
          onClick={() => setView('targetLanguage')}
          title={t('subtitles.outputLanguage')}
        >
          <span className="player-subtitle-menu__pill-code">{languageBadge(targetSubtitleLanguage)}</span>
          <span className="player-subtitle-menu__pill-label">{targetLanguageName}</span>
        </button>

        {!isGenerating && showTranslateButton && sourceTrackForTranslation && (
          <button
            type="button"
            className="player-subtitle-menu__pill player-subtitle-menu__pill--accent"
            disabled={!translationAction.canTranslate}
            title={t('subtitles.translateSourceToTarget', {
              sourceLanguage: sourceLanguageNameForTrack,
              targetLanguage: targetLanguageName,
            })}
            onClick={() => { void translateExisting(invalidGenerated.length > 0); }}
          >
            <span className="player-subtitle-menu__pill-label">→ {languageBadge(targetSubtitleLanguage)}</span>
          </button>
        )}

        {!isGenerating && (
          <button
            type="button"
            className="player-subtitle-menu__pill"
            disabled={!canGenerate}
            title={t('subtitles.generateFromAudio', { language: targetLanguageName })}
            onClick={() => { void generateFromAudio(invalidGenerated.length > 0); }}
          >
            <IconSparkGenerate width={14} height={14} />
          </button>
        )}

        <button
          type="button"
          className="player-subtitle-menu__pill"
          title={t('subtitles.locateSubtitleFile')}
          onClick={() => { void importSubtitle(); }}
        >
          <IconFileImport width={14} height={14} />
        </button>

        <button
          type="button"
          className={`player-subtitle-menu__pill${showAdvanced ? ' is-active' : ''}`}
          title={t('subtitles.section.advanced')}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          ···
        </button>

      </div>

      {!hasTrackInOutputLanguage && !isLoadingSubtitles && (
        <p className="player-subtitle-menu__toolbar-hint">
          {t('subtitles.outputLanguageNotAvailable', { language: targetLanguageName })}
        </p>
      )}

      {!canGenerate && generationHint && !showAdvanced && (
        <p className="player-subtitle-menu__toolbar-hint">{generationHint}</p>
      )}

      {showAdvanced && (
        <>
          <div className="player-subtitle-menu__divider" />
          <span className="player-subtitle-menu__section-label">{t('subtitles.section.sourceSubtitles')}</span>
          {displaySourceTrack && !isLoadingSubtitles ? (
            <p className="player-subtitle-menu__compact-line">
              {displaySourceTrack.languageLabel}
              {sourceFileName ? ` · ${sourceFileName}` : ''}
            </p>
          ) : !isLoadingSubtitles ? (
            <p className="player-subtitle-menu__empty">{t('subtitles.noSourceSubtitlesFound')}</p>
          ) : null}
          <p className="player-subtitle-menu__compact-line">
            {t('subtitles.sourceAudioLanguageValue', { language: sourceLanguageName })}
            {usingJapaneseHint ? ` · ${t('subtitles.usingJapaneseAnimeHint')}` : ''}
          </p>
          {modelQualityWarning && (
            <p className="player-subtitle-menu__toolbar-hint">{t('subtitles.whisperModelQualityWarning')}</p>
          )}

          <button

            type="button"

            className="player-subtitle-menu__section"

            onClick={() => setView('sourceLanguage')}

          >

            {t('subtitles.sourceAudioLanguageValue', { language: sourceLanguageName })}

          </button>

          <button

            type="button"

            className="player-subtitle-menu__section"

            onClick={() => setMarkForeignSpeech(!markForeignSpeech)}

          >

            {t('subtitles.markForeignSpeech')}: {markForeignSpeech ? t('subtitles.markForeignSpeechOn') : t('subtitles.markForeignSpeechOff')}

          </button>

          <button

            type="button"

            className="player-subtitle-menu__section"

            onClick={() => setShowSoundLabels(!showSoundLabels)}

          >

            {t('subtitles.showSoundLabels')}: {showSoundLabels ? t('subtitles.markForeignSpeechOn') : t('subtitles.markForeignSpeechOff')}

          </button>

          <button

            type="button"

            className="player-subtitle-menu__section"

            onClick={() => setNameStyle(nameStyle === 'romanized' ? 'localized_ru' : 'romanized')}

          >

            {t('subtitles.nameStyle')}: {nameStyle === 'romanized'
              ? t('subtitles.nameStyleRomanized')
              : t('subtitles.nameStyleLocalizedRu')}

          </button>

          {sourceAudioLanguage === 'auto' && (

            <p className="player-subtitle-menu__hint">{t('subtitles.speechDetectedAutomatically')}</p>

          )}

          {isAnimeMediaPath(videoPath) && sourceAudioLanguage === 'auto' && (
            <p className="player-subtitle-menu__hint">{t('subtitles.animeJapaneseSpeechHint')}</p>
          )}

          {availableAudioStreams.length > 1 && (
            <label className="player-subtitle-menu__section">
              {t('subtitles.audioTrack')}
              <select
                value={selectedAudioStreamIndex ?? ''}
                onChange={(event) => {
                  const raw = event.target.value;
                  setSelectedAudioStreamIndex(raw === '' ? null : Number(raw));
                }}
              >
                {availableAudioStreams.map((stream) => (
                  <option key={stream.index} value={stream.index}>
                    {stream.label}
                    {stream.isCommentary ? ` (${t('subtitles.audioCommentary')})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="player-subtitle-menu__section">
            {t('subtitles.speakerColor.inputLabel')}
            <input
              type="text"
              value={colorSpeakerName}
              placeholder="Sonic"
              onChange={(e) => setColorSpeakerName(e.target.value)}
            />
          </label>
          <SpeakerColorPanel
            videoKey={videoKey}
            videoPath={videoPath}
            speakerName={colorSpeakerName.trim() || null}
            franchiseKey={detectFranchiseKey(videoPath)}
          />

          <span className="player-subtitle-menu__section-label">{t('subtitles.diagnosticsTitle')}</span>
          <p className="player-subtitle-menu__hint">
            {t('subtitles.diagnosticsBackend', {
              value: generationAvailability === 'ready'
                ? t('subtitles.diagnosticsYes')
                : t('subtitles.diagnosticsNo'),
            })}
          </p>
          {generationDetail && (
            <p className="player-subtitle-menu__hint">
              {t('subtitles.diagnosticsModel', {
                value: generationDetail.whisperModelAvailable
                  ? t('subtitles.diagnosticsYes')
                  : t('subtitles.diagnosticsNo'),
              })}
              {generationDetail.whisperModelPath ? ` · ${generationDetail.whisperModelPath}` : ''}
            </p>
          )}
          <p className="player-subtitle-menu__hint">
            {t('subtitles.diagnosticsActiveTrack', {
              value: selectedTrack
                ? formatSubtitleMenuLabel(selectedTrack, t)
                : t('subtitles.diagnosticsOff'),
            })}
          </p>
          {generationProgressDetail?.generatedCueCount != null && (
            <p className="player-subtitle-menu__hint">
              {t('subtitles.cuesReady', { count: String(generationProgressDetail.generatedCueCount) })}
            </p>
          )}
          {userDisabledLiveSubtitles && (
            <p className="player-subtitle-menu__hint">{t('subtitles.useLiveSubtitles')}</p>
          )}
          {selectedTrack?.source === 'generated' && (() => {
            const debug = getSubtitleDebugSnapshot();
            const firstCueText = debug.firstCues?.[0]?.text ?? '';
            const speaker = firstCueText ? resolveCueSpeaker({ start: 0, end: 0, text: firstCueText }) : undefined;
            return (
              <>
                <p className="player-subtitle-menu__hint">
                  {t('subtitles.diagnosticsSpeaker', {
                    value: speaker
                      ? t('subtitles.diagnosticsYes')
                      : t('subtitles.diagnosticsNo'),
                  })}
                </p>
                {!speaker && (
                  <p className="player-subtitle-menu__hint">{t('subtitles.diagnosticsNoSpeaker')}</p>
                )}
              </>
            );
          })()}

          {!canGenerate && generationHint && (
            <div className="player-subtitle-menu__hint-block">
              <p className="player-subtitle-menu__toolbar-hint">{generationHint}</p>
              <button
                type="button"
                className="player-subtitle-menu__inline-action"
                onClick={() => setShowGenDetails((v) => !v)}
              >
                {t('subtitles.ffmpegDetails')}
              </button>
              {showGenDetails && (
                <pre className="player-subtitle-menu__details">
                  {generationDetail?.ffmpegAvailable
                    ? t('subtitles.genDetail.ffmpegOk')
                    : t('subtitles.genDetail.ffmpegMissing')}
                  {generationDetail?.ffmpegPath ? `\n  ${generationDetail.ffmpegPath}` : ''}
                  {'\n'}
                  {generationDetail?.whisperCliAvailable
                    ? t('subtitles.genDetail.whisperCliOk')
                    : t('subtitles.genDetail.whisperCliMissing')}
                  {generationDetail?.whisperCliPath ? `\n  ${generationDetail.whisperCliPath}` : ''}
                  {'\n'}
                  {generationDetail?.whisperModelAvailable
                    ? t('subtitles.genDetail.whisperModelOk', { model: generationDetail.whisperModelName })
                    : t('subtitles.genDetail.whisperModelMissing', { model: generationDetail?.whisperModelName ?? 'base' })}
                  {generationDetail?.whisperModelPath ? `\n  ${generationDetail.whisperModelPath}` : ''}
                  {'\n'}
                  {generationDetail?.whisperGpuAvailable
                    ? t('subtitles.genDetail.whisperGpuOk', {
                      backend: generationDetail.whisperGpuBackend ?? 'gpu',
                      layers: generationDetail.whisperGpuLayers ?? 99,
                    })
                    : t('subtitles.genDetail.whisperGpuCpu')}
                  {generationDetail?.whisperModelHint ? `\n\n${generationDetail.whisperModelHint}` : ''}
                </pre>
              )}
            </div>
          )}

        </>

      )}

    </>

  );



  const targetLanguageMenu = (

    <>

      <button type="button" className="player-subtitle-menu__back" onClick={() => setView('main')}>

        ← {t('subtitles.back')}

      </button>

      <span className="player-subtitle-menu__title">{t('subtitles.outputLanguage')}</span>

      {SUBTITLE_TARGET_LANGUAGE_OPTIONS.map((opt) => (

        <button

          key={opt.value}

          type="button"

          className={targetSubtitleLanguage === opt.value ? 'is-active' : ''}

          onClick={() => {

            setTargetSubtitleLanguage(opt.value as TargetSubtitleLanguage);

            setView('main');

          }}

        >

          {targetSubtitleLanguage === opt.value ? '✓ ' : ''}

          {t(opt.labelKey as Parameters<typeof t>[0])}

        </button>

      ))}

    </>

  );



  const sourceLanguageMenu = (

    <>

      <button type="button" className="player-subtitle-menu__back" onClick={() => setView('main')}>

        ← {t('subtitles.back')}

      </button>

      <span className="player-subtitle-menu__title">{t('subtitles.sourceAudioLanguage')}</span>

      {SUBTITLE_SOURCE_LANGUAGE_OPTIONS.map((opt) => (

        <button

          key={opt.value}

          type="button"

          className={sourceAudioLanguage === opt.value ? 'is-active' : ''}

          onClick={() => {

            setSourceAudioLanguage(opt.value as SourceAudioLanguage);

            setView('main');

          }}

        >

          {sourceAudioLanguage === opt.value ? '✓ ' : ''}

          {t(opt.labelKey as Parameters<typeof t>[0])}

        </button>

      ))}

    </>

  );



  const menu = menuMounted && !props.disabled ? createPortal(

    <div

      ref={menuRef}

      id={menuId}

      className={`player-subtitle-menu player-control-sheet player-control-sheet--anchor-end ${sheetPhaseClass}`}

      data-video-control

      role="menu"

      aria-label={t('player.subtitles')}

      style={{ top: menuStyle.top, left: menuStyle.left }}

      onClick={(e) => e.stopPropagation()}

    >

      {view === 'targetLanguage' ? targetLanguageMenu : view === 'sourceLanguage' ? sourceLanguageMenu : mainMenu}

    </div>,

    document.body

  ) : null;



  return (

    <>

      <PlayerFeatureChip

        ref={buttonRef}

        label={t('player.subtitles')}

        open={open}

        on={Boolean(selectedTrackId)}

        badge={selectedTrack ? languageBadge(selectedTrack.language) : undefined}

        disabled={props.disabled}

        onClick={(e) => {

          e.stopPropagation();

          if (props.disabled) return;

          const next = popover ? !popover.isOpen('subtitles') : !open;
          setOpenState(next);

        }}

      >

        <IconCaptions />

      </PlayerFeatureChip>

      {menu}

    </>

  );

}

