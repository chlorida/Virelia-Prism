import type { SubtitleTrack } from '../../../shared/subtitleTypes';
import { getPrism } from '../../lib/prismApi';
import { readSubtitleFile } from '../../lib/tauriCommands';
import { parseAssToCues } from './assParser';
import {
  findActiveCue,
  logSubtitlePipeline,
  looksLikeHtmlPayload,
  previewText,
  resetSubtitleDebug,
  updateSubtitleDebug,
} from './subtitleDebug';
import { convertSrtToVtt } from './srtToVtt';
import { isPartialPlaybackTrack } from './generatedSubtitleUsability';
import { enrichCuesWithSpeakerColors, type SubtitleColorContext } from './subtitleCueColors';
import {
  detectRepeatedHallucinations,
  filterDisplayCues,
  validateGeneratedSubtitles,
  validatePartialPlaybackCues,
} from './subtitleCueUtils';
import { sanitizeCueTextForDisplay } from './subtitleSanitize';
import { parseVtt, type ParsedCue } from './vttParser';

let applyGeneration = 0;
let activeCues: ParsedCue[] = [];
let overlayEl: HTMLElement | null = null;
let boundVideo: HTMLVideoElement | null = null;
let boundOverlay: HTMLElement | null = null;
let boundVideoKey: string | null = null;
let boundVideoPath: string | null = null;
let syncHandler: (() => void) | null = null;
let onAddTrack: ((ev: Event) => void) | null = null;
let lastRenderedKey = '';
let forceShowUntil = 0;
let forceShowText = '';
let renderLogCounter = 0;

const RENDER_LOG_EVERY = 30;

export type SubtitleApplyErrorKind = 'parse' | 'validation' | 'runtime' | 'stale' | 'read';

export interface SubtitleApplyResult {
  ok: boolean;
  cueCount: number;
  parsedCueCount?: number;
  displayCueCount?: number;
  error?: string;
  errorKind?: SubtitleApplyErrorKind;
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function detachListeners(): void {
  if (boundVideo && syncHandler) {
    boundVideo.removeEventListener('timeupdate', syncHandler);
    boundVideo.removeEventListener('seeked', syncHandler);
    boundVideo.removeEventListener('play', syncHandler);
    boundVideo.removeEventListener('pause', syncHandler);
    boundVideo.removeEventListener('loadedmetadata', syncHandler);
  }
  if (boundVideo && onAddTrack) {
    boundVideo.removeEventListener('addtrack', onAddTrack as EventListener);
  }
  syncHandler = null;
  onAddTrack = null;
  boundVideo = null;
  boundOverlay = null;
}

function revokeListeners(): void {
  detachListeners();
  activeCues = [];
  boundVideoKey = null;
  boundVideoPath = null;
  forceShowUntil = 0;
  forceShowText = '';
  lastRenderedKey = '';
}

function removeOverlay(): void {
  if (overlayEl) {
    overlayEl.textContent = '';
    overlayEl.classList.remove('prism-subtitle-overlay--active');
    overlayEl.remove();
  }
  overlayEl = null;
}

function suppressNativeTextTracks(video: HTMLVideoElement): void {
  for (let i = 0; i < video.textTracks.length; i++) {
    video.textTracks[i].mode = 'disabled';
  }
  const trackEls = video.querySelectorAll('track');
  for (const el of trackEls) el.remove();
}

function clearVideoTracks(video: HTMLVideoElement): void {
  revokeListeners();
  removeOverlay();
  suppressNativeTextTracks(video);
}

function findVideoFrameHost(video: HTMLVideoElement): HTMLElement {
  return (
    video.closest('.video-stage__surface')
    ?? video.closest('.video-stage__media-host')
    ?? video.closest('.mini-player__video')
    ?? video.parentElement
    ?? video
  );
}

function ensureOverlay(video: HTMLVideoElement): HTMLElement {
  const host = findVideoFrameHost(video);
  host.style.position = 'relative';

  const existing = host.querySelectorAll('[data-prism-subtitle-overlay]');
  for (const node of existing) node.remove();

  const overlay = document.createElement('div');
  overlay.className = 'prism-subtitle-overlay';
  overlay.setAttribute('data-prism-subtitle-overlay', 'true');
  overlay.setAttribute('aria-live', 'polite');
  host.appendChild(overlay);
  overlayEl = overlay;
  return overlay;
}

function logRenderState(
  video: HTMLVideoElement,
  overlay: HTMLElement,
  hit: ParsedCue | null,
  displayText: string
): void {
  renderLogCounter += 1;
  if (renderLogCounter % RENDER_LOG_EVERY !== 0 && !import.meta.env?.DEV) return;

  const rect = overlay.getBoundingClientRect();
  const style = globalThis.getComputedStyle(overlay);
  console.debug('[Virelia subtitles] render', {
    currentTime: video.currentTime,
    activeCueText: hit?.text ?? null,
    overlayExists: Boolean(overlay.isConnected),
    overlayTextContent: overlay.textContent,
    overlayRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    computed: {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      zIndex: style.zIndex,
    },
    cueCount: activeCues.length,
    forceShow: Date.now() < forceShowUntil,
  });
}

function buildOutlineShadow(outlineColor: string): string {
  return [
    `0 0 2px ${outlineColor}`,
    `0 0 4px ${outlineColor}`,
    `0 1px 3px ${outlineColor}`,
    `1px 1px 0 ${outlineColor}`,
    `-1px -1px 0 ${outlineColor}`,
  ].join(', ');
}

function applyCueVisualStyle(overlay: HTMLElement, cue: ParsedCue | null): void {
  const color = cue?.color ?? '#FFFFFF';
  const outlineColor = cue?.outlineColor ?? '#000000';
  overlay.style.color = color;
  overlay.style.textShadow = buildOutlineShadow(outlineColor);
}

function setOverlayText(overlay: HTMLElement, text: string, cue: ParsedCue | null = null): void {
  if (!text) {
    overlay.textContent = '';
    overlay.classList.remove('prism-subtitle-overlay--active');
    return;
  }
  applyCueVisualStyle(overlay, cue);
  overlay.textContent = text;
  overlay.classList.add('prism-subtitle-overlay--active');
}

function renderActiveCues(video: HTMLVideoElement, overlay: HTMLElement): void {
  if (boundVideoKey && boundVideoPath && boundVideo !== video) {
    setOverlayText(overlay, '');
    lastRenderedKey = '';
    return;
  }

  if (Date.now() < forceShowUntil) {
    const key = `force:${forceShowText}`;
    if (key !== lastRenderedKey) {
      lastRenderedKey = key;
      setOverlayText(overlay, forceShowText, null);
      logRenderState(video, overlay, null, forceShowText);
    }
    return;
  }

  const t = video.currentTime;
  const hit = findActiveCue(activeCues, t, { hideNonSpeech: true });
  const displayText = hit?.text ? sanitizeCueTextForDisplay(hit.text) : '';
  const renderKey = hit ? `${hit.start}|${hit.end}|${displayText}` : '';
  if (renderKey === lastRenderedKey) return;
  lastRenderedKey = renderKey;

  if (import.meta.env?.DEV) {
    updateSubtitleDebug({
      videoCurrentTime: t,
      activeCue: hit ? { start: hit.start, end: hit.end, text: hit.text } : null,
      displayText,
      displayTextError: displayText === '' && hit?.text ? 'sanitized_raw_subtitle_text' : null,
    });
  }

  setOverlayText(overlay, displayText, hit);
  logRenderState(video, overlay, hit, displayText);
}

function bindCueSync(video: HTMLVideoElement, overlay: HTMLElement): void {
  detachListeners();
  boundVideo = video;
  boundOverlay = overlay;
  lastRenderedKey = '';
  suppressNativeTextTracks(video);
  syncHandler = () => renderActiveCues(video, overlay);
  onAddTrack = () => suppressNativeTextTracks(video);

  video.addEventListener('timeupdate', syncHandler);
  video.addEventListener('seeked', syncHandler);
  video.addEventListener('play', syncHandler);
  video.addEventListener('pause', syncHandler);
  video.addEventListener('loadedmetadata', syncHandler);
  video.addEventListener('addtrack', onAddTrack as EventListener);

  renderActiveCues(video, overlay);
}

async function loadSubtitleText(
  track: SubtitleTrack
): Promise<{ raw: string; source: 'tauri' | 'fetch'; contentType: string | null }> {
  if (!track.path) return { raw: '', source: 'fetch', contentType: null };

  try {
    const raw = await readSubtitleFile(track.path);
    if (raw.trim()) {
      return { raw: stripBom(raw), source: 'tauri', contentType: 'text/plain' };
    }
  } catch (error) {
    console.warn('[Virelia subtitles] readSubtitleFile failed, trying fetch', track.path, error);
  }

  const prism = getPrism();
  if (!prism) return { raw: '', source: 'fetch', contentType: null };
  const url = await prism.mediaUrl(track.path);
  if (!url) return { raw: '', source: 'fetch', contentType: null };

  const response = await fetch(url);
  const contentType = response.headers.get('content-type');
  if (!response.ok) {
    console.warn('[Virelia subtitles] fetch failed', track.path, response.status, contentType);
    return { raw: '', source: 'fetch', contentType };
  }
  return { raw: stripBom(await response.text()), source: 'fetch', contentType };
}

function detectSubtitlePayloadFormat(raw: string, trackFormat: string): 'vtt' | 'ass' | 'srt' {
  const head = raw.trimStart().slice(0, 128);
  if (/^\[Script Info\]/i.test(head) || /\[Events\]/i.test(raw.slice(0, 800))) return 'ass';
  if (/^WEBVTT\b/i.test(head)) return 'vtt';
  if (trackFormat === 'ass' || trackFormat === 'ssa') return 'ass';
  if (trackFormat === 'vtt') return 'vtt';
  return 'srt';
}

export function parseSubtitleCuesForTrack(
  track: SubtitleTrack,
  raw: string
): { cues: ParsedCue[]; convertedPreview: string; detectedFormat: 'vtt' | 'ass' | 'srt' } {
  const detectedFormat = detectSubtitlePayloadFormat(raw, track.format);
  if (detectedFormat === 'ass') {
    const cues = parseAssToCues(raw);
    return {
      cues,
      detectedFormat,
      convertedPreview: previewText(cues.slice(0, 3).map((c) => `${c.start}->${c.end} ${c.text}`).join('\n')),
    };
  }
  if (detectedFormat === 'vtt') {
    const cues = parseVtt(raw);
    return { cues, detectedFormat, convertedPreview: previewText(raw) };
  }
  const vtt = convertSrtToVtt(raw);
  return { cues: parseVtt(vtt), detectedFormat, convertedPreview: previewText(vtt) };
}

function parseSubtitleCues(track: SubtitleTrack, raw: string): { cues: ParsedCue[]; convertedPreview: string } {
  const { cues, convertedPreview } = parseSubtitleCuesForTrack(track, raw);
  return { cues, convertedPreview };
}

export function getActiveSubtitleCues(): ParsedCue[] {
  return [...activeCues];
}

export function getFirstSubtitleCue(): ParsedCue | null {
  return activeCues[0] ?? null;
}

export function jumpToFirstSubtitle(video: HTMLVideoElement | null): boolean {
  const first = getFirstSubtitleCue();
  if (!video || !first) return false;
  const target = first.start + 0.1;
  video.currentTime = target;
  if (overlayEl && boundVideo === video) {
    renderActiveCues(video, overlayEl);
  }
  console.info('[Virelia subtitles] jump to first cue', { target, text: first.text });
  return true;
}

export function forceShowSubtitleTest(video: HTMLVideoElement | null): void {
  if (!video) return;
  if (!overlayEl || !overlayEl.isConnected) {
    ensureOverlay(video);
  }
  const overlay = overlayEl;
  if (!overlay) return;

  forceShowText = 'SUBTITLE OVERLAY TEST';
  forceShowUntil = Date.now() + 3000;
  setOverlayText(overlay, forceShowText);
  logRenderState(video, overlay, null, forceShowText);

  globalThis.setTimeout(() => {
    forceShowUntil = 0;
    forceShowText = '';
    if (boundVideo && overlayEl) {
      renderActiveCues(boundVideo, overlayEl);
    }
  }, 3000);

  console.info('[Virelia subtitles] force show test for 3s');
}

export function setSubtitleTimingOffset(_ms: number): void {
  // Reserved for future cue offset.
}

function restoreCuePlayback(
  video: HTMLVideoElement,
  cues: ParsedCue[],
  videoKey: string,
  videoPath: string | null
): void {
  activeCues = cues;
  boundVideoKey = videoKey;
  boundVideoPath = videoPath;
  lastRenderedKey = '';
  const overlay = ensureOverlay(video);
  suppressNativeTextTracks(video);
  bindCueSync(video, overlay);
}

export async function applySubtitleTrack(
  video: HTMLVideoElement | null,
  track: SubtitleTrack | null,
  context?: {
    videoKey: string;
    videoPath: string;
    videoDuration?: number;
    colorContext?: SubtitleColorContext;
  }
): Promise<SubtitleApplyResult> {
  const generation = ++applyGeneration;
  if (!video) {
    return { ok: false, cueCount: 0, error: 'no video element' };
  }

  const rollbackCues = activeCues.length > 0 ? [...activeCues] : null;
  const rollbackKey = boundVideoKey;
  const rollbackPath = boundVideoPath;

  if (!track?.path) {
    clearVideoTracks(video);
    resetSubtitleDebug();
    boundVideoKey = context?.videoKey ?? track?.videoKey ?? null;
    boundVideoPath = context?.videoPath ?? track?.videoPath ?? null;
    return { ok: true, cueCount: 0 };
  }

  const expectedKey = context?.videoKey ?? track.videoKey;
  const expectedPath = context?.videoPath ?? track.videoPath;
  if (track.videoKey !== expectedKey || (expectedPath && track.videoPath !== expectedPath)) {
    console.warn('[Virelia subtitles] stale subtitle track rejected at apply', {
      expectedKey,
      expectedPath,
      trackKey: track.videoKey,
      trackPath: track.videoPath,
      trackId: track.id,
    });
    return { ok: false, cueCount: 0, error: 'stale subtitle track', errorKind: 'stale' };
  }

  try {
    const { raw, source, contentType } = await loadSubtitleText(track);
    if (generation !== applyGeneration) {
      return { ok: false, cueCount: 0, error: 'superseded' };
    }

    const htmlPayload = looksLikeHtmlPayload(raw);
    if (!raw.trim() || htmlPayload) {
      const err = htmlPayload ? 'subtitle file read returned HTML' : 'subtitle file is empty';
      logSubtitlePipeline(track, {
        readSource: source,
        rawLength: raw.length,
        rawPreview: previewText(raw),
        convertedPreview: '',
        fetchedContentType: contentType,
        looksLikeHtml: htmlPayload,
        applyError: err,
        videoCurrentTime: video.currentTime,
        activeCue: null,
      }, []);
      if (rollbackCues && rollbackKey === expectedKey) {
        restoreCuePlayback(video, rollbackCues, rollbackKey, rollbackPath);
      }
      return { ok: false, cueCount: 0, error: err };
    }

    const { cues: parsedCues, convertedPreview } = parseSubtitleCues(track, raw);
    if (generation !== applyGeneration) {
      return { ok: false, cueCount: 0, error: 'superseded' };
    }

    const videoDuration = context?.videoDuration
      ?? (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined);

    updateSubtitleDebug({
      rawSubtitleTextLength: raw.length,
      parsedCueCount: parsedCues.length,
      videoDuration: videoDuration ?? null,
      repetitionStats: detectRepeatedHallucinations(parsedCues),
      lastCues: parsedCues.slice(-5).map((c) => ({ start: c.start, end: c.end, text: c.text })),
    });

    if (parsedCues.length === 0) {
      logSubtitlePipeline(track, {
        readSource: source,
        rawLength: raw.length,
        rawPreview: previewText(raw),
        convertedPreview,
        fetchedContentType: contentType,
        looksLikeHtml: false,
        applyError: 'no cues parsed',
        videoCurrentTime: video.currentTime,
        activeCue: null,
      }, parsedCues);
      updateSubtitleDebug({ parseError: 'no cues parsed' });
      if (rollbackCues && rollbackKey === expectedKey) {
        restoreCuePlayback(video, rollbackCues, rollbackKey, rollbackPath);
      } else {
        clearVideoTracks(video);
      }
      return {
        ok: false,
        cueCount: 0,
        parsedCueCount: 0,
        displayCueCount: 0,
        error: 'parse_failed',
        errorKind: 'parse',
      };
    }

    let displayCues = parsedCues;
    if (track.source === 'generated') {
      const partialPlayback = isPartialPlaybackTrack(track);
      if (track.generationValid === false && !partialPlayback) {
        const reason = track.generationInvalidReason ?? 'generated_invalid';
        updateSubtitleDebug({
          validationStatus: 'invalid',
          invalidReason: reason,
        });
        return {
          ok: false,
          cueCount: 0,
          parsedCueCount: parsedCues.length,
          displayCueCount: 0,
          error: reason,
          errorKind: 'validation',
        };
      }

      const validation = partialPlayback
        ? validatePartialPlaybackCues(parsedCues)
        : validateGeneratedSubtitles(parsedCues, {
          videoDuration,
          rawLength: raw.length,
        });
      updateSubtitleDebug({
        validationStatus: validation.valid ? 'valid' : 'invalid',
        invalidReason: validation.reason ?? null,
        videoDuration: videoDuration ?? validation.coverageStats?.videoDuration ?? null,
        cueCount: validation.totalCueCount,
        speechCueCount: validation.speechCueCount,
        totalCueDuration: validation.coverageStats?.totalCueDuration ?? null,
        coverageRatio: validation.coverageStats?.coverageRatio ?? null,
        lastCueEnd: validation.coverageStats?.lastCueEnd ?? null,
        longestGap: validation.coverageStats?.longestGap ?? null,
        repetitionStats: validation.repetitionStats ?? detectRepeatedHallucinations(parsedCues),
        validationError: validation.valid ? null : (validation.reason ?? 'generated_invalid'),
      });

      if (!validation.valid) {
        logSubtitlePipeline(track, {
          readSource: source,
          rawLength: raw.length,
          rawPreview: previewText(raw),
          convertedPreview,
          fetchedContentType: contentType,
          looksLikeHtml: false,
          applyError: validation.reason ?? 'generated_invalid',
          videoCurrentTime: video.currentTime,
          activeCue: null,
        }, parsedCues);
        if (rollbackCues && rollbackKey === expectedKey) {
          restoreCuePlayback(video, rollbackCues, rollbackKey, rollbackPath);
        } else {
          clearVideoTracks(video);
        }
        return {
          ok: false,
          cueCount: 0,
          parsedCueCount: parsedCues.length,
          displayCueCount: 0,
          error: validation.reason ?? 'generated_invalid',
          errorKind: 'validation',
        };
      }

      displayCues = filterDisplayCues(parsedCues, false);
      if (displayCues.length === 0) {
        displayCues = parsedCues.filter((cue) => sanitizeCueTextForDisplay(cue.text).length > 0);
      }
      if (displayCues.length === 0) {
        logSubtitlePipeline(track, {
          readSource: source,
          rawLength: raw.length,
          rawPreview: previewText(raw),
          convertedPreview,
          fetchedContentType: contentType,
          looksLikeHtml: false,
          applyError: 'generated_no_speech',
          videoCurrentTime: video.currentTime,
          activeCue: null,
        }, parsedCues);
        if (rollbackCues && rollbackKey === expectedKey) {
          restoreCuePlayback(video, rollbackCues, rollbackKey, rollbackPath);
        } else {
          clearVideoTracks(video);
        }
        return {
          ok: false,
          cueCount: 0,
          parsedCueCount: parsedCues.length,
          displayCueCount: 0,
          error: 'generated_no_speech',
          errorKind: 'validation',
        };
      }
    } else {
      displayCues = filterDisplayCues(parsedCues, false);
    }

    if (displayCues.length === 0) {
      updateSubtitleDebug({ validationError: 'no_display_cues' });
      if (rollbackCues && rollbackKey === expectedKey) {
        restoreCuePlayback(video, rollbackCues, rollbackKey, rollbackPath);
      } else {
        clearVideoTracks(video);
      }
      return {
        ok: false,
        cueCount: 0,
        parsedCueCount: parsedCues.length,
        displayCueCount: 0,
        error: 'generated_no_speech',
        errorKind: 'validation',
      };
    }

    if (generation !== applyGeneration) {
      return { ok: false, cueCount: 0, error: 'superseded' };
    }

    const coloredCues = await enrichCuesWithSpeakerColors(displayCues, context?.colorContext);
    if (generation !== applyGeneration) {
      return { ok: false, cueCount: 0, error: 'superseded' };
    }

    logSubtitlePipeline(track, {
      readSource: source,
      rawLength: raw.length,
      rawPreview: previewText(raw),
      convertedPreview,
      fetchedContentType: contentType,
      looksLikeHtml: false,
      applyError: null,
      videoCurrentTime: video.currentTime,
      activeCue: findActiveCue(coloredCues, video.currentTime, { hideNonSpeech: true }),
    }, parsedCues);

    clearVideoTracks(video);
    activeCues = coloredCues;
    boundVideoKey = expectedKey;
    boundVideoPath = expectedPath ?? null;
    lastRenderedKey = '';
    const firstCue = coloredCues[0] ?? null;
    const activeCue = findActiveCue(coloredCues, video.currentTime, { hideNonSpeech: true });
    updateSubtitleDebug({
      parseError: null,
      validationError: null,
      displayText: activeCue ? sanitizeCueTextForDisplay(activeCue.text) : '',
      selectedTrackSource: track.source,
      selectedTrackStatus: 'valid',
      firstCues: firstCue ? [{ start: firstCue.start, end: firstCue.end, text: firstCue.text }] : [],
      videoCurrentTime: video.currentTime,
      activeCue: activeCue
        ? { start: activeCue.start, end: activeCue.end, text: activeCue.text }
        : null,
    });
    const overlay = ensureOverlay(video);
    bindCueSync(video, overlay);
    return {
      ok: true,
      cueCount: coloredCues.length,
      parsedCueCount: parsedCues.length,
      displayCueCount: coloredCues.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateSubtitleDebug({ applyError: message, parseError: message });
    console.warn('[Virelia subtitles] failed to apply track', track.path, error);
    if (rollbackCues && rollbackKey === expectedKey) {
      restoreCuePlayback(video, rollbackCues, rollbackKey, rollbackPath);
    } else {
      clearVideoTracks(video);
    }
    const isParseFailure = /parse|invalid vtt|invalid srt|invalid ass/i.test(message);
    return {
      ok: false,
      cueCount: 0,
      error: message,
      errorKind: isParseFailure ? 'parse' : 'runtime',
    };
  }
}

export function detachSubtitleRenderer(video?: HTMLVideoElement | null): void {
  ++applyGeneration;
  if (video) clearVideoTracks(video);
  else {
    revokeListeners();
    removeOverlay();
  }
  resetSubtitleDebug();
}
