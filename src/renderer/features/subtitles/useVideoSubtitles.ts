import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { MediaItem } from '../../../shared/types';

import type { AppSettings } from '../../../shared/types';
import { playUiSound } from '../../services/uiAudioService';

import type {
  GenerationAvailabilityReason,
  SourceAudioLanguage,
  SubtitlePreferredLanguage,
  TargetSubtitleLanguage,
} from '../../../shared/subtitleTypes';

import {

  cancelSubtitleGeneration,

  clearGeneratedSubtitleCache,

  discoverSubtitles,

  extractEmbeddedSubtitle,

  generateSubtitles,

  getFfmpegStatus,

  getSubtitleGenerationAvailability,

  importSubtitleForVideo,

  pickSubtitleFile,

  probeVideoAudioStreams,

  onSubtitleGenerationCancelled,

  onSubtitleGenerationCompleted,

  onSubtitleGenerationFailed,

  onSubtitleGenerationPartial,

  onSubtitleGenerationProgress,

  onSubtitleGenerationStarted,

  refreshSubtitleIndexForVideo,

  translateExistingSubtitles,

  type FfmpegStatus,

  type SubtitleGenerationAvailability,

} from '../../lib/tauriCommands';

import { usePlaybackActions, usePlaybackSelector } from '../../playback/usePlayback';

import { isValidGeneratedTrack } from './subtitleCueQuality';
import { isPartialPlaybackTrack } from './generatedSubtitleUsability';
import { humanizePlaybackSubtitleError, humanizeSubtitleError } from './subtitleErrors';
import { createSubtitleStore, type SubtitleStore } from './subtitleStore';

import {

  defaultTargetSubtitleLanguage,

  pickAutoSubtitleTrack,

  resolvePreferredLanguage,

  resolveTargetSubtitleLanguage,

} from './subtitleSelection';

import { getSubtitleDebugSnapshot, updateSubtitleDebug } from './subtitleDebug';
import {
  formatGenerationDiagnostics,
  resolveEffectiveSourceLanguage,
} from './subtitleGenerationDiagnostics';
import { filterTracksForVideo, findTrackForVideo, makeVideoKey } from './subtitleScope';
import {
  logGenerationResult,
  mergeGeneratedTracksForLanguage,
} from './subtitleGenerationResult';
import { pickSourceSubtitleForTranslation } from './subtitleGenerationHints';
import { buildCoverageRanges, mergeGenerationDetail } from './subtitleCoverage';
import type { SubtitleGenerationProgressDetail, SubtitleTrack } from '../../../shared/subtitleTypes';
import {
  applySubtitleTrack,
  detachSubtitleRenderer,
  forceShowSubtitleTest,
  jumpToFirstSubtitle,
  setSubtitleTimingOffset,
} from './subtitleTextTrack';
import type { SubtitleColorContext } from './subtitleCueColors';

import { formatDuration } from '../../lib/search';
import { useI18n } from '../../i18n/I18nProvider';

import type { TranslationKey } from '../../../shared/i18n';



function isTauri(): boolean {

  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

}

type SubtitleDiscoveryResult = Awaited<ReturnType<typeof discoverSubtitles>>;
const subtitleDiscoveryCache = new Map<string, SubtitleDiscoveryResult>();
const audioProbeCache = new Map<string, Awaited<ReturnType<typeof probeVideoAudioStreams>>>();
let generationAvailabilityCheckedAt = 0;
const GENERATION_AVAILABILITY_TTL_MS = 60_000;

function resolveVideoDurationSeconds(
  video: MediaItem | null | undefined,
  videoEl: HTMLVideoElement | null
): number | undefined {
  if (videoEl && Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
    return videoEl.duration;
  }
  if (video?.durationSeconds && video.durationSeconds > 0) {
    return video.durationSeconds;
  }
  return undefined;
}

function mapProgressDetail(p: import('../../lib/tauriCommands').SubtitleGenerationEvent): Partial<SubtitleGenerationProgressDetail> {
  const detail: Partial<SubtitleGenerationProgressDetail> = {
    status: (p.status as SubtitleGenerationProgressDetail['status']) ?? 'transcribing',
    liveSubtitlesSupported: true,
  };
  if (p.generatedUntilSeconds != null) detail.generatedUntilSeconds = p.generatedUntilSeconds;
  if (p.generatedCueCount != null) detail.generatedCueCount = p.generatedCueCount;
  if (p.validCueCount != null) detail.validCueCount = p.validCueCount;
  if (p.coverageRatio != null) detail.coverageRatio = p.coverageRatio;
  if (p.currentSegmentStart != null) detail.currentSegmentStart = p.currentSegmentStart;
  if (p.currentSegmentEnd != null) detail.currentSegmentEnd = p.currentSegmentEnd;
  if (p.backend) detail.backend = p.backend;
  if (p.model) detail.model = p.model;
  if (p.targetLanguage) detail.targetLanguage = p.targetLanguage;
  const raw = p as import('../../lib/tauriCommands').SubtitleGenerationEvent & {
    coverageRanges?: SubtitleGenerationProgressDetail['coverageRanges'];
    contiguousFromStart?: boolean;
    rangeCount?: number;
  };
  if (raw.coverageRanges) detail.coverageRanges = raw.coverageRanges;
  if (raw.contiguousFromStart != null) detail.contiguousFromStart = raw.contiguousFromStart;
  if (raw.rangeCount != null) detail.rangeCount = raw.rangeCount;
  return detail;
}

function buildSubtitleColorContext(
  video: MediaItem,
  videoKey: string,
  appSettings?: AppSettings
): SubtitleColorContext | undefined {
  const speakerColors = appSettings?.subtitles.speakerColors ?? 'auto';
  if (speakerColors === 'off') return undefined;
  return {
    videoKey,
    videoPath: video.filePath,
    speakerColorsMode: speakerColors === 'franchise' ? 'franchise' : 'auto',
  };
}

function isSubtitleGenerating(status: string): boolean {
  return status === 'running'
    || status === 'queued'
    || status === 'preparing'
    || status === 'extracting_audio'
    || status === 'transcribing'
    || status === 'translating'
    || status === 'writing'
    || status === 'validating'
    || status === 'partial_ready';
}

function buildLivePartialTrack(
  video: MediaItem,
  videoKey: string,
  path: string,
  lang: string,
  generatedUntil?: number
): SubtitleTrack {
  return {
    id: `${videoKey}-generated-partial-${lang}`,
    videoId: video.id,
    videoPath: video.filePath,
    videoKey,
    source: 'generated',
    language: lang,
    languageLabel: lang,
    label: `Live — ${lang}`,
    format: 'vtt',
    path,
    generationValid: true,
    isPartial: true,
    isLiveUpdating: true,
    generatedUntilSeconds: generatedUntil,
  };
}



function mapProgressMessage(
  message: string | undefined,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string | undefined {

  if (!message) return undefined;

  if (message.includes('translated') && message.includes('/')) {
    const match = message.match(/translated (\d+)\/(\d+)/);
    if (match) {
      return t('subtitles.progress.translatedCues', { done: match[1], total: match[2] });
    }
  }

  if (message.includes('translating existing')) return t('subtitles.progress.translatingExisting');

  if (message.includes('loading source')) return t('subtitles.progress.loadingSourceSubtitles');

  if (message.includes('finalizing translated')) return t('subtitles.progress.finalizingTranslation');

  if (message.includes('external')) return t('subtitles.progress.loadingExternal');

  if (message.includes('extract')) return t('subtitles.progress.extracting');

  if (message.includes('transcribing segment')) return message;

  if (message.includes('transcri')) return t('subtitles.progress.transcribing');

  if (message.includes('process')) return t('subtitles.progress.processing');

  if (message.includes('sav')) return t('subtitles.progress.saving');

  return undefined;

}



export function useVideoSubtitles(settings?: AppSettings) {

  const { t, locale } = useI18n();

  const { actions } = usePlaybackActions();
  const currentTrack = usePlaybackSelector((s) => s.currentTrack);
  const playbackState = { currentTrack };

  const storeRef = useRef<SubtitleStore | null>(null);
  const loadGenerationRef = useRef(0);
  const lastSuccessfulTrackIdRef = useRef<string | null>(null);
  const partialApplyQueueRef = useRef(Promise.resolve());
  const [coverageHoldUntil, setCoverageHoldUntil] = useState(0);

  if (!storeRef.current) storeRef.current = createSubtitleStore();



  const store = storeRef.current;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [ffmpegStatus, setFfmpegStatus] = useState<FfmpegStatus | null>(null);
  const [generationDetail, setGenerationDetail] = useState<SubtitleGenerationAvailability | null>(null);



  const subtitleState = useSyncExternalStore(

    (listener) => store.subscribe(listener),

    () => store.getState(),

    () => store.getState()

  );



  const refreshGenerationAvailability = useCallback(async () => {

    if (!isTauri()) return null;

    const model = settings?.subtitles.whisperModel ?? 'base';
    const transcriptionBackend = settings?.subtitles.transcriptionBackend ?? 'whisper-cpp';

    const [status, availability] = await Promise.all([

      getFfmpegStatus(),

      getSubtitleGenerationAvailability(model),

    ]);

    setFfmpegStatus(status);
    setGenerationDetail(availability);

    const generationAvailability: GenerationAvailabilityReason =
      transcriptionBackend === 'disabled'
      || (transcriptionBackend !== 'whisper-cpp' && transcriptionBackend !== undefined)
        ? 'unavailable_no_backend'
        : availability.reason as GenerationAvailabilityReason;

    store.patch({

      ffmpegAvailable: status.available,

      generationAvailability,

      translationAvailable: availability.translationAvailable,

    });

    if (import.meta.env?.DEV) {

      console.debug('[Virelia subtitles] generation availability', availability);

      console.debug('[Virelia subtitles] ffmpeg resolver', status);

    }

    return { availability, generationAvailability, transcriptionBackend };

  }, [settings?.subtitles.transcriptionBackend, settings?.subtitles.whisperModel, store]);



  useEffect(() => {

    void refreshGenerationAvailability();

  }, [refreshGenerationAvailability]);

  useEffect(() => {

    store.patch({ targetSubtitleLanguage: defaultTargetSubtitleLanguage(locale, settings) });

  }, [locale, settings, store]);



  const activateTrack = useCallback(async (

    pick: import('../../../shared/subtitleTypes').SubtitleTrack,

    video: MediaItem,

    appSettings?: AppSettings

  ) => {

    const videoKey = makeVideoKey(video.id);
    if (!findTrackForVideo([pick], pick.id, videoKey, video.filePath)) {
      store.patch({
        selectedTrackId: null,
        playbackError: undefined,
        playbackErrorKind: undefined,
        playbackErrorDetails: undefined,
        playbackErrorTrackId: null,
      });
      detachSubtitleRenderer(actions.getElement());
      return;
    }

    if (pick.source === 'generated' && !isValidGeneratedTrack(pick)) {
      const { message } = humanizePlaybackSubtitleError(
        pick.generationInvalidReason ?? 'generated_invalid',
        'validation',
        t
      );
      store.patchTrackRuntime(pick.id, {
        status: 'invalid',
        error: message,
        invalidReason: pick.generationInvalidReason ?? 'generated_invalid',
      });
      return;
    }

    let track = pick;

    if (track.source === 'embedded' && !track.path && track.embeddedTrackIndex != null) {

      const format = appSettings?.subtitles.generatedFormat ?? 'vtt';

      track = await extractEmbeddedSubtitle(

        video.id,

        video.filePath,

        track.embeddedTrackIndex,

        format

      );

      const current = store.getState().availableTracks;

      const merged = current.some((tr) => tr.id === track.id)

        ? current.map((tr) => (tr.id === track.id ? track : tr))

        : [...current, track];

      store.setTracks(merged, videoKey);

    }

    setSubtitleTimingOffset(appSettings?.subtitles.timingOffsetMs ?? 0);

    updateSubtitleDebug({
      currentVideoPath: video.filePath,
      currentVideoKey: videoKey,
      selectedTrackVideoKey: track.videoKey,
      staleTrackIgnored: track.videoKey !== videoKey,
    });

    const videoEl = actions.getElement();
    const result = await applySubtitleTrack(videoEl, track, {
      videoKey,
      videoPath: video.filePath,
      videoDuration: videoEl && Number.isFinite(videoEl.duration) && videoEl.duration > 0
        ? videoEl.duration
        : undefined,
      colorContext: buildSubtitleColorContext(video, videoKey, appSettings),
    });
    if (store.getState().videoKey !== videoKey) return;
    if (!result.ok && result.error === 'superseded') return;
    if (result.ok) {
      lastSuccessfulTrackIdRef.current = track.id;
      store.patchTrackRuntime(track.id, {
        status: 'valid',
        error: undefined,
        invalidReason: undefined,
      });
      store.patch({
        playbackError: undefined,
        playbackErrorKind: undefined,
        playbackErrorDetails: undefined,
        playbackErrorTrackId: null,
      });
      return;
    }

    const { message, details } = humanizePlaybackSubtitleError(
      result.error ?? 'parse_failed',
      result.errorKind,
      t
    );
    const revertTrackId = track.source === 'generated'
      ? lastSuccessfulTrackIdRef.current
      : store.getState().selectedTrackId;

    store.patchTrackRuntime(track.id, {
      status: track.source === 'generated'
        ? (isPartialPlaybackTrack(track) ? 'loading' : 'invalid')
        : 'failed',
      error: message,
      invalidReason: result.error,
    });

    if (track.source === 'generated') {
      if (isPartialPlaybackTrack(track)) {
        return;
      }
      store.patch({
        selectedTrackId: revertTrackId ?? null,
        playbackError: undefined,
        playbackErrorKind: undefined,
        playbackErrorDetails: undefined,
        playbackErrorTrackId: null,
      });
      return;
    }

    detachSubtitleRenderer(actions.getElement());
    store.patch({
      selectedTrackId: revertTrackId ?? null,
      playbackError: message,
      playbackErrorKind: result.errorKind,
      playbackErrorDetails: details ?? result.error,
      playbackErrorTrackId: track.id,
    });

  }, [actions, store, t]);



  const startGeneration = useCallback(async (
    track: MediaItem,
    targetLanguage: string,
    sourceLanguage: string,
    markForeignSpeech: boolean,
    regenerate = false,
    generationMode: 'auto' | 'translate_existing' | 'from_audio' = 'auto',
    preferExternalSubtitles = true,
  ) => {

    if (!isTauri()) return;

    const availabilitySnapshot = await refreshGenerationAvailability();

    const state = store.getState();
    const availability = state.generationAvailability;
    const needsWhisper = generationMode !== 'translate_existing';

    if (needsWhisper && availability !== 'ready') {

      const detail = availabilitySnapshot?.availability;
      const model = settings?.subtitles.whisperModel ?? 'base';
      const message = availability === 'unavailable_no_model'
        ? t('subtitles.generationModelMissing', { model: detail?.whisperModelName ?? model })
        : availability === 'unavailable_no_backend'
        ? t('subtitles.generationNoBackend')
        : t('subtitles.generationUnavailable');

      store.setGeneration('failed', undefined, message);

      return;

    }

    if (!needsWhisper && !state.ffmpegAvailable) {
      store.setGeneration('failed', undefined, t('subtitles.generationUnavailable'));
      return;
    }

    if (targetLanguage !== 'en' && !state.translationAvailable) {
      const needsTranslationBackend = generationMode === 'from_audio'
        || !filterTracksForVideo(state.availableTracks, makeVideoKey(track.id)).some(
          (tr) => (tr.source === 'external' || tr.source === 'embedded')
            && (tr.language === targetLanguage
              || tr.language.split('-')[0] === targetLanguage.split('-')[0]),
        );
      if (needsTranslationBackend) {
        store.setGeneration('failed', undefined, t('subtitles.translationNotConfigured'));
        return;
      }
    }

    const progressKey = generationMode === 'translate_existing'
      ? 'subtitles.progress.loadingExternal'
      : 'subtitles.progress.extracting';
    store.setGeneration('queued', 0, undefined, t(progressKey as TranslationKey));

    try {

      await generateSubtitles({

        videoId: track.id,

        videoPath: track.filePath,

        targetLanguage,

        sourceLanguage,

        outputFormat: settings?.subtitles.generatedFormat === 'ass' ? 'ass' : 'vtt',

        model: settings?.subtitles.whisperModel ?? 'base',

        regenerate,

        markForeignSpeech,

        generationMode,

        preferExternalSubtitles,

        showSoundLabels: state.showSoundLabels,

        nameStyle: state.nameStyle,

        audioStreamIndex: state.selectedAudioStreamIndex,

      });

    } catch (error) {

      const raw = error instanceof Error ? error.message : String(error);

      const { message, details } = humanizeSubtitleError(raw, t);

      store.setGeneration('failed', undefined, message, undefined, details, null);

    }

  }, [refreshGenerationAvailability, settings, store, t]);



  const loadForVideo = useCallback(async (track: MediaItem | null) => {

    if (!track || track.kind !== 'video' || !track.filePath) {

      detachSubtitleRenderer(actions.getElement());

      store.reset();

      return;

    }

    if (!isTauri()) return;



    detachSubtitleRenderer(actions.getElement());
    lastSuccessfulTrackIdRef.current = null;

    const preferred = resolvePreferredLanguage(settingsRef.current);
    const videoKey = makeVideoKey(track.id);
    const loadGeneration = ++loadGenerationRef.current;

    const state = store.getState();
    const targetSubtitleLanguage = state.targetSubtitleLanguage
      ?? defaultTargetSubtitleLanguage(locale, settingsRef.current);

    store.beginVideoLoad(track.id, track.filePath, videoKey);
    store.patch({
      preferredLanguage: preferred,
      targetSubtitleLanguage,
    });

    try {

      let result = subtitleDiscoveryCache.get(track.id);
      if (!result) {
        result = await discoverSubtitles(track.id, track.filePath);
        subtitleDiscoveryCache.set(track.id, result);
      }
      if (loadGeneration !== loadGenerationRef.current) return;
      if (store.getState().videoKey !== videoKey) return;

      try {
        let audioStreams = audioProbeCache.get(track.filePath);
        if (!audioStreams) {
          audioStreams = await probeVideoAudioStreams(track.filePath);
          audioProbeCache.set(track.filePath, audioStreams);
        }
        if (store.getState().videoKey === videoKey) {
          const defaultStream = audioStreams.find((s) => s.isDefault && !s.isCommentary)
            ?? audioStreams.find((s) => !s.isCommentary)
            ?? audioStreams[0];
          store.setAudioStreams(audioStreams, defaultStream?.index ?? null);
        }
      } catch {
        store.setAudioStreams([], null);
      }

      const scopedTracks = filterTracksForVideo(result.tracks, videoKey);
      const externalCount = scopedTracks.filter((tr) => tr.source === 'external').length;

      store.setTracks(scopedTracks, videoKey);

      store.setExternalScanStatus(

        externalCount > 0 ? 'found' : scopedTracks.length > 0 ? 'found' : 'notFound'

      );

      const generatedTracks = scopedTracks.filter((tr) => tr.source === 'generated');
      updateSubtitleDebug({
        currentVideoPath: track.filePath,
        currentVideoKey: videoKey,
        allTrackVideoKeys: scopedTracks.map((tr) => tr.videoKey),
        externalTrackPaths: scopedTracks.filter((tr) => tr.source === 'external').map((tr) => tr.path ?? ''),
        generatedTrackPaths: generatedTracks.map((tr) => tr.path ?? ''),
        generatedTrackDebug: generatedTracks.map((tr) => ({
          trackId: tr.id,
          targetLanguage: tr.language,
          generationValid: tr.generationValid,
          generationInvalidReason: tr.generationInvalidReason,
          path: tr.path,
          pipelineVersion: tr.generationPipelineVersion,
        })),
        staleTrackIgnored: result.tracks.some((tr) => tr.videoKey !== videoKey),
      });

      if (import.meta.env?.DEV && result.debug) {

        console.debug('[Virelia subtitles] discovery', result.debug);

        for (const tr of scopedTracks) {

          console.debug('[Virelia subtitles] track', {

            id: tr.id,

            source: tr.source,

            label: tr.label,

            language: tr.language,

            path: tr.path,

          });

        }

      }



      const appSettings = settingsRef.current;
      const shouldAutoGenerate = appSettings?.subtitles.autoGenerate === true;

      const availabilityStale = Date.now() - generationAvailabilityCheckedAt > GENERATION_AVAILABILITY_TTL_MS;
      const availabilityResult = availabilityStale
        ? await refreshGenerationAvailability()
        : null;
      if (availabilityResult) {
        generationAvailabilityCheckedAt = Date.now();
      }
      if (loadGeneration !== loadGenerationRef.current) return;
      if (store.getState().videoKey !== videoKey) return;

      const generationReady = availabilityResult
        ? availabilityResult.generationAvailability === 'ready'
        : store.getState().generationAvailability === 'ready';

      if (appSettings?.subtitles.autoLoad !== false) {

        const pick = pickAutoSubtitleTrack(scopedTracks, preferred, targetSubtitleLanguage);

        if (pick) {

          store.patch({ selectedTrackId: pick.id });

        } else if (shouldAutoGenerate && generationReady) {

          const s = store.getState();

          void startGeneration(
            track,
            resolveTargetSubtitleLanguage(s.targetSubtitleLanguage, appSettings),
            resolveEffectiveSourceLanguage(s.sourceAudioLanguage, track.filePath),
            s.markForeignSpeech
          );

        }

      } else if (shouldAutoGenerate && generationReady) {

        const s = store.getState();

        void startGeneration(
          track,
          resolveTargetSubtitleLanguage(s.targetSubtitleLanguage, appSettings),
          resolveEffectiveSourceLanguage(s.sourceAudioLanguage, track.filePath),
          s.markForeignSpeech
        );

      }

    } catch {

      store.patch({ loading: false, availableTracks: [], externalScanStatus: 'failed' });

    }

  }, [actions, activateTrack, locale, refreshGenerationAvailability, startGeneration, store]);



  const loadForVideoRef = useRef(loadForVideo);
  loadForVideoRef.current = loadForVideo;

  useEffect(() => {

    const current = playbackState.currentTrack;

    if (!current || current.kind !== 'video') {

      detachSubtitleRenderer(actions.getElement());

      store.reset();

      return;

    }

    let cancelled = false;
    const run = () => {
      if (!cancelled) void loadForVideoRef.current(current);
    };

    if (typeof requestIdleCallback === 'function') {
      const idleId = requestIdleCallback(run, { timeout: 1200 });
      return () => {
        cancelled = true;
        cancelIdleCallback(idleId);
      };
    }

    const timer = window.setTimeout(run, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };

  }, [actions, playbackState.currentTrack?.id, store]);



  useEffect(() => {

    const trackId = subtitleState.selectedTrackId;

    const video = playbackState.currentTrack;

    if (!trackId || !video) return;

    const videoKey = subtitleState.videoKey ?? makeVideoKey(video.id);
    const track = findTrackForVideo(
      subtitleState.availableTracks,
      trackId,
      videoKey,
      video.filePath
    );

    if (!track) {
      if (trackId) {
        store.patch({
          selectedTrackId: null,
          playbackError: undefined,
          playbackErrorKind: undefined,
          playbackErrorDetails: undefined,
          playbackErrorTrackId: null,
        });
      }
      detachSubtitleRenderer(actions.getElement());
      return;
    }

    void activateTrack(track, video, settings);

  }, [actions, activateTrack, playbackState.currentTrack, settings, store, subtitleState.availableTracks, subtitleState.selectedTrackId, subtitleState.videoKey]);



  useEffect(() => {

    if (!isTauri() || !subtitleState.videoId) return;

    const videoId = subtitleState.videoId;

    let cancelled = false;

    const unsubs: Array<() => void> = [];



    void (async () => {

      unsubs.push(await onSubtitleGenerationStarted((p) => {

        if (p.videoId !== videoId || cancelled) return;

        store.setGeneration('running', 0, undefined, t('subtitles.progress.extracting'));

      }));

      unsubs.push(await onSubtitleGenerationProgress((p) => {

        if (p.videoId !== videoId || cancelled) return;

        const video = playbackState.currentTrack;
        const duration = resolveVideoDurationSeconds(video, actions.getElement());
        const detail = mergeGenerationDetail(store.getState().generationDetail, {
          ...mapProgressDetail(p),
          durationSeconds: duration,
        });

        store.setGeneration(
          p.status === 'transcribing' ? 'transcribing' : 'running',
          p.progress ?? 0,
          undefined,
          mapProgressMessage(p.message, t) ?? p.message,
          undefined,
          null,
          detail,
          buildCoverageRanges(duration, detail)
        );

      }));

      unsubs.push(await onSubtitleGenerationPartial(async (p) => {

        if (p.videoId !== videoId || cancelled) return;

        const video = playbackState.currentTrack;
        if (!video?.filePath) return;
        const videoKey = makeVideoKey(video.id);
        const state = store.getState();
        const lang = p.targetLanguage ?? state.targetSubtitleLanguage;
        const duration = resolveVideoDurationSeconds(video, actions.getElement());
        const detail = mergeGenerationDetail(store.getState().generationDetail, {
          ...mapProgressDetail(p),
          durationSeconds: duration,
        });

        const partialTrack = buildLivePartialTrack(
          video,
          videoKey,
          p.path ?? '',
          lang,
          p.generatedUntilSeconds
        );
        store.upsertPartialTrack(partialTrack);

        const usePartial = settings?.subtitles.usePartialGeneratedSubtitles !== false;
        const userDisabled = state.userDisabledLiveSubtitles === true;
        const scopedTracks = filterTracksForVideo(state.availableTracks, videoKey);
        const hasValidExternalForLang = scopedTracks.some(
          (tr) => (tr.source === 'external' || tr.source === 'embedded')
            && (tr.language === lang || tr.language.split('-')[0] === lang.split('-')[0])
            && tr.generationValid !== false
        );
        const mayAutoSelect = usePartial && !userDisabled && !hasValidExternalForLang;

        if (mayAutoSelect && !state.selectedTrackId) {
          store.patch({ selectedTrackId: partialTrack.id });
        } else if (mayAutoSelect || state.selectedTrackId === partialTrack.id) {
          partialApplyQueueRef.current = partialApplyQueueRef.current
            .catch(() => {})
            .then(() => activateTrack(partialTrack, video, settings));
        }

        store.setGeneration(
          'partial_ready',
          p.progress ?? store.getState().generationProgress,
          undefined,
          t('subtitles.progress.partialReady'),
          undefined,
          null,
          detail,
          buildCoverageRanges(duration, detail)
        );

      }));

      unsubs.push(await onSubtitleGenerationCompleted(async (p) => {

        if (p.videoId !== videoId || cancelled) return;

        setCoverageHoldUntil(Date.now() + 5000);
        store.setGeneration('completed', 1);
        playUiSound('success');

        const video = playbackState.currentTrack;

        if (video?.filePath) {
          const videoKey = makeVideoKey(video.id);
          if (store.getState().videoKey !== videoKey) return;

          const result = await discoverSubtitles(video.id, video.filePath);
          if (store.getState().videoKey !== videoKey) return;

          const state = store.getState();
          const targetLang = state.targetSubtitleLanguage;
          const scopedTracks = filterTracksForVideo(result.tracks, videoKey);
          const mergedTracks = mergeGeneratedTracksForLanguage(scopedTracks, targetLang);
          store.setTracks(mergedTracks, videoKey);

          const newGenerated = mergedTracks.find(
            (tr) => tr.source === 'generated'
              && (tr.language === targetLang || tr.language.split('-')[0] === targetLang.split('-')[0])
              && isValidGeneratedTrack(tr)
          );

          if (newGenerated) {
            if (newGenerated.videoKey !== videoKey) {
              console.error('[Virelia subtitles] generated track videoKey mismatch', {
                expected: videoKey,
                actual: newGenerated.videoKey,
                trackId: newGenerated.id,
              });
            } else {
              store.patch({
                selectedTrackId: newGenerated.id,
                selectionWarning: undefined,
                playbackError: undefined,
                playbackErrorKind: undefined,
                playbackErrorDetails: undefined,
                playbackErrorTrackId: null,
              });
            }
          }

          const afterSelect = store.getState();
          await logGenerationResult({
            videoPath: video.filePath,
            videoKey,
            targetLanguage: targetLang,
            outputPath: p.path,
            tracks: afterSelect.availableTracks,
            selectedTrackId: afterSelect.selectedTrackId,
            video: actions.getElement(),
          });
        }

      }));

      unsubs.push(await onSubtitleGenerationFailed(async (p) => {

        if (p.videoId !== videoId || cancelled) return;

        const reason = p.diagnostics?.reason ?? p.error ?? '';
        const hasRecovered = (p.diagnostics?.recoveredCueCount ?? 0) > 0;
        const recoveredCount = p.diagnostics?.recoveredCueCount ?? 0;
        const coverageUntil = p.diagnostics?.coverageUntilSeconds ?? 0;
        const duration = resolveVideoDurationSeconds(playbackState.currentTrack, actions.getElement());
        const recoveryRatio = duration && coverageUntil > 0 ? coverageUntil / duration : 0;
        const softRecovery = hasRecovered && recoveryRatio >= 0.8;
        const { message, details } = softRecovery
          ? {
            message: t('subtitles.partialRecoveredAvailable'),
            details: t('subtitles.partialRecoveredDetail', {
              count: String(recoveredCount),
              time: formatDuration(coverageUntil),
            }),
          }
          : reason === 'repeated_hallucinated_text' && hasRecovered
            ? { message: t('subtitles.hallucinationStoppedRecovered'), details: formatGenerationDiagnostics(p.diagnostics!) }
            : humanizeSubtitleError(p.error, t);
        const diagnosticDetails = p.diagnostics
          ? formatGenerationDiagnostics(p.diagnostics)
          : details;

        const video = playbackState.currentTrack;
        if (video?.filePath) {
          const videoKey = makeVideoKey(video.id);
          const result = await discoverSubtitles(video.id, video.filePath);
          const scopedTracks = filterTracksForVideo(result.tracks, videoKey);
          store.setTracks(scopedTracks, videoKey);
          const recovered = scopedTracks.find(
            (tr) => tr.isPartial && tr.recoveredFromFailure && isValidGeneratedTrack(tr)
          );
          if (recovered) {
            store.patch({ selectedTrackId: recovered.id, userDisabledLiveSubtitles: false });
            const videoDuration = resolveVideoDurationSeconds(video, actions.getElement());
            const until = recovered.generatedUntilSeconds
              ?? p.diagnostics?.coverageUntilSeconds
              ?? 0;
            const detail = mergeGenerationDetail(store.getState().generationDetail, {
              durationSeconds: videoDuration,
              generatedUntilSeconds: until,
              generatedCueCount: p.diagnostics?.recoveredCueCount ?? recovered.generatedUntilSeconds,
              coverageRatio: videoDuration && until > 0 ? Math.min(1, until / videoDuration) : 0,
              coverageRanges: [],
            });
            setCoverageHoldUntil(Date.now() + 5000);
            store.setGeneration(
              softRecovery ? 'partial_ready' : 'failed',
              undefined,
              message,
              undefined,
              diagnosticDetails,
              p.diagnostics ?? null,
              detail,
              []
            );
            void activateTrack(recovered, video, settings);
            playUiSound(softRecovery ? 'warning' : 'error');
            return;
          }
        }

        store.setGeneration(
          'failed',
          undefined,
          message,
          undefined,
          diagnosticDetails,
          p.diagnostics ?? null,
          store.getState().generationDetail,
          store.getState().coverageRanges
        );
        playUiSound('error');

      }));

      unsubs.push(await onSubtitleGenerationCancelled((p) => {

        if (p.videoId !== videoId || cancelled) return;

        store.setGeneration('cancelled');

      }));

    })();



    return () => {

      cancelled = true;

      unsubs.forEach((u) => u());

    };

  }, [actions, activateTrack, playbackState.currentTrack, settings, store, subtitleState.videoId, t]);

  useEffect(() => {
    if (coverageHoldUntil <= Date.now()) return;
    const timer = globalThis.setTimeout(() => setCoverageHoldUntil(0), coverageHoldUntil - Date.now() + 50);
    return () => globalThis.clearTimeout(timer);
  }, [coverageHoldUntil]);

  const getVisibleCoverageRanges = useCallback((menuOpen: boolean) => {
    if (settings?.subtitles.subtitleTimelineCoverage === false) return undefined;
    const state = store.getState();
    const ranges = state.coverageRanges ?? [];
    if (ranges.length === 0) return undefined;

    if (isSubtitleGenerating(state.generationStatus)) return ranges;
    if (menuOpen) return ranges;
    if (Date.now() < coverageHoldUntil) return ranges;

    const selected = state.selectedTrackId
      ? state.availableTracks.find((tr) => tr.id === state.selectedTrackId)
      : null;
    if (selected?.isPartial || selected?.isLiveUpdating) {
      return menuOpen ? ranges : undefined;
    }

    return undefined;
  }, [coverageHoldUntil, settings?.subtitles.subtitleTimelineCoverage, store]);

  const selectTrack = useCallback((trackId: string | null) => {
    const prev = store.getState().selectedTrackId;
    const livePartialActive = store.getState().availableTracks.some(
      (tr) => tr.isLiveUpdating && tr.isPartial
    );
    store.patch({
      selectedTrackId: trackId,
      userDisabledLiveSubtitles: !trackId && livePartialActive,
      playbackError: undefined,
      playbackErrorKind: undefined,
      playbackErrorDetails: undefined,
      playbackErrorTrackId: null,
    });

    if (!trackId) {
      void applySubtitleTrack(actions.getElement(), null);
      return;
    }

    const video = playbackState.currentTrack;
    const videoKey = subtitleState.videoKey;
    if (!video || !videoKey) return;
    const track = findTrackForVideo(
      subtitleState.availableTracks,
      trackId,
      videoKey,
      video.filePath
    );
    if (track?.source === 'generated' && !isValidGeneratedTrack(track)) {
      store.patch({ selectionWarning: t('subtitles.invalidGeneratedSelect') });
      return;
    }
    store.patch({ selectionWarning: undefined, userDisabledLiveSubtitles: false });
    if (prev !== trackId) playUiSound('confirm');

  }, [actions, playbackState.currentTrack, store, subtitleState.availableTracks, subtitleState.videoKey, t]);

  const useLiveSubtitles = useCallback(() => {
    const state = store.getState();
    const videoKey = state.videoKey;
    if (!videoKey) return;
    const liveTrack = state.availableTracks.find(
      (tr) => tr.videoKey === videoKey && tr.isPartial && tr.isLiveUpdating && isValidGeneratedTrack(tr)
    );
    if (!liveTrack) return;
    store.patch({
      userDisabledLiveSubtitles: false,
      selectedTrackId: liveTrack.id,
      selectionWarning: undefined,
    });
  }, [store]);

  const setTargetSubtitleLanguage = useCallback((language: TargetSubtitleLanguage) => {

    store.setTargetSubtitleLanguage(language);

  }, [store]);

  const setSourceAudioLanguage = useCallback((language: SourceAudioLanguage) => {

    store.setSourceAudioLanguage(language);

  }, [store]);

  const setMarkForeignSpeech = useCallback((enabled: boolean) => {

    store.setMarkForeignSpeech(enabled);

  }, [store]);

  const setShowSoundLabels = useCallback((enabled: boolean) => {
    store.setShowSoundLabels(enabled);
  }, [store]);

  const setNameStyle = useCallback((style: 'romanized' | 'localized_ru') => {
    store.setNameStyle(style);
  }, [store]);



  const refreshSubtitles = useCallback(async () => {

    const video = playbackState.currentTrack;

    if (!video?.filePath) return;

    store.patch({ loading: true, externalScanStatus: 'scanning' });

    const result = await refreshSubtitleIndexForVideo(video.id, video.filePath);

    store.setTracks(result.tracks);

    store.setExternalScanStatus(result.tracks.length > 0 ? 'found' : 'notFound');

  }, [playbackState.currentTrack, store]);



  const cancelGeneration = useCallback(() => {

    const videoId = store.getState().videoId;

    if (videoId) void cancelSubtitleGeneration(videoId);

  }, [store]);



  const runGeneration = useCallback((
    regenerate = false,
    generationMode: 'auto' | 'translate_existing' | 'from_audio' = 'auto',
    preferExternalSubtitles = true,
  ) => {
    const video = playbackState.currentTrack;
    if (!video) return;
    const s = store.getState();
    void startGeneration(
      video,
      resolveTargetSubtitleLanguage(s.targetSubtitleLanguage, settings),
      resolveEffectiveSourceLanguage(s.sourceAudioLanguage, video.filePath),
      s.markForeignSpeech,
      regenerate,
      generationMode,
      preferExternalSubtitles,
    );
  }, [playbackState.currentTrack, settings, startGeneration, store]);

  const generate = useCallback((regenerate = false) => {
    runGeneration(regenerate, 'auto', true);
  }, [runGeneration]);

  const translateExisting = useCallback(async (regenerate = false) => {
    const video = playbackState.currentTrack;
    if (!video?.filePath || !isTauri()) return;

    const state = store.getState();
    if (!state.translationAvailable) {
      store.setGeneration('failed', undefined, t('subtitles.translationNotConfigured'));
      return;
    }

    const videoKey = makeVideoKey(video.id);
    const scopedTracks = filterTracksForVideo(state.availableTracks, videoKey);
    const targetLanguage = resolveTargetSubtitleLanguage(state.targetSubtitleLanguage, settings);
    const sourceTrack = pickSourceSubtitleForTranslation(scopedTracks, targetLanguage);
    if (!sourceTrack?.path) {
      store.setGeneration('failed', undefined, t('subtitles.noExternalSubtitles'));
      return;
    }

    store.setGeneration('queued', 0, undefined, t('subtitles.progress.translatingExisting'));

    try {
      if (regenerate) {
        await clearGeneratedSubtitleCache(video.filePath);
      }
      await translateExistingSubtitles({
        videoId: video.id,
        videoPath: video.filePath,
        sourceSubtitlePath: sourceTrack.path,
        sourceLanguage: sourceTrack.language === 'und' ? 'auto' : sourceTrack.language,
        targetLanguage,
        outputFormat: settings?.subtitles.generatedFormat === 'ass' ? 'ass' : 'vtt',
        markForeignSpeech: state.markForeignSpeech,
        showSoundLabels: state.showSoundLabels,
        speakerColorMode: settings?.subtitles.speakerColors === 'franchise'
          ? 'franchise'
          : settings?.subtitles.speakerColors === 'off'
            ? 'off'
            : 'auto',
        nameStyle: state.nameStyle,
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const { message, details } = humanizeSubtitleError(raw, t);
      store.setGeneration('failed', undefined, message, undefined, details, null);
    }
  }, [playbackState.currentTrack, settings, store, t]);

  const generateFromAudio = useCallback((regenerate = false) => {
    runGeneration(regenerate, 'from_audio', false);
  }, [runGeneration]);

  const importSubtitle = useCallback(async () => {
    const video = playbackState.currentTrack;
    if (!video?.filePath || !isTauri()) return;
    const picked = await pickSubtitleFile();
    if (!picked) return;
    const videoKey = makeVideoKey(video.id);
    const result = await importSubtitleForVideo(video.id, video.filePath, picked);
    if (store.getState().videoKey !== videoKey) return;
    const scopedTracks = filterTracksForVideo(result.tracks, videoKey);
    store.setTracks(scopedTracks, videoKey);
    store.setExternalScanStatus(scopedTracks.some((tr) => tr.source === 'external') ? 'found' : 'notFound');
    const imported = scopedTracks.find((tr) => tr.source === 'external' && tr.path?.includes('imported.'));
    if (imported) store.patch({ selectedTrackId: imported.id });
  }, [playbackState.currentTrack, store]);

  const setSelectedAudioStreamIndex = useCallback((index: number | null) => {
    store.setSelectedAudioStreamIndex(index);
  }, [store]);

  const deleteGenerated = useCallback(async () => {
    const video = playbackState.currentTrack;
    if (!video?.filePath || !isTauri()) return;

    const videoKey = makeVideoKey(video.id);
    await clearGeneratedSubtitleCache(video.filePath);
    if (store.getState().videoKey !== videoKey) return;

    const result = await discoverSubtitles(video.id, video.filePath);
    if (store.getState().videoKey !== videoKey) return;

    const scopedTracks = filterTracksForVideo(result.tracks, videoKey);
    store.setTracks(scopedTracks, videoKey);
    store.patch({
      selectedTrackId: null,
      playbackError: undefined,
      playbackErrorKind: undefined,
      playbackErrorDetails: undefined,
      playbackErrorTrackId: null,
    });
    store.setCoverageRanges([]);
    setCoverageHoldUntil(0);
    lastSuccessfulTrackIdRef.current = null;
    detachSubtitleRenderer(actions.getElement());
  }, [actions, playbackState.currentTrack, store]);



  return {

    subtitleState,

    getVisibleCoverageRanges,

    generationProgressDetail: subtitleState.generationDetail,

    ffmpegStatus,

    generationDetail,

    translationBackend: settings?.subtitles.translation?.backend ?? 'disabled',

    selectTrack,

    useLiveSubtitles,

    setTargetSubtitleLanguage,

    setSourceAudioLanguage,

    setMarkForeignSpeech,

    setShowSoundLabels,

    setNameStyle,

    refreshSubtitles,

    cancelGeneration,

    generate,

    translateExisting,

    generateFromAudio,

    deleteGenerated,

    importSubtitle,

    setSelectedAudioStreamIndex,

    logSubtitleDebug: () => {
      const video = actions.getElement();
      const state = store.getState();
      const videoKey = state.videoKey;
      const selected = state.selectedTrackId && videoKey
        ? findTrackForVideo(
          state.availableTracks,
          state.selectedTrackId,
          videoKey,
          state.videoPath ?? undefined
        )
        : null;
      updateSubtitleDebug({
        videoCurrentTime: video?.currentTime ?? null,
        selectedTrackId: state.selectedTrackId,
        selectedTrackSource: selected?.source ?? null,
        selectedTrackStatus: selected ? (selected.status ?? 'valid') : null,
      });
      const debug = getSubtitleDebugSnapshot();
      console.info('[Virelia subtitles] debug snapshot', debug);
      return debug;
    },

    jumpToFirstSubtitle: () => jumpToFirstSubtitle(actions.getElement()),

    forceShowSubtitleTest: () => forceShowSubtitleTest(actions.getElement()),

  };

}

export type VideoSubtitlesState = ReturnType<typeof useVideoSubtitles>;

