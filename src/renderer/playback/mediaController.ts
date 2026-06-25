import type { MediaItem } from '../../shared/types';
import { exitDomFullscreen, toggleDomFullscreen } from '../lib/domFullscreen';
import { getPrism } from '../lib/prismApi';
import { cancelHtmlPlaybackLoads, configureMediaElement, loadAndPlayMedia, loadMediaPaused, peekResolvedMediaUrl, resolveMediaUrl } from '../lib/htmlPlayback';
import { describeMediaError, type MediaErrorKey } from './mediaErrors';
import type { PlaybackStore } from './playbackStore';
import type { PlaybackStatus } from './playbackTypes';
import { savePlaybackSession } from './mediaPersistence';
import {
  classifyPlaybackErrorMessage,
  clearMediaPlaybackHealth,
  markMediaPlaybackFailed,
} from '../lib/mediaIntelligence/mediaPlaybackHealth';
import { playUiSound } from '../services/uiAudioService';

export interface MediaControllerOptions {
  translateError: (key: MediaErrorKey) => string;
  onEnded?: () => void;
  onPersist?: () => void;
}

export interface LoadTrackOptions {
  autoPlay?: boolean;
  startSeconds?: number;
  muted?: boolean;
}

export class MediaController {
  private element: HTMLVideoElement | null = null;
  private sink: HTMLElement | null = null;
  private previewHost: HTMLElement | null = null;
  private loadGeneration = 0;
  private seeking = false;
  private listenersBound = false;
  private persistDebounceTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  private readonly sessionPersistTimer: ReturnType<typeof globalThis.setInterval> | undefined;

  constructor(
    private readonly store: PlaybackStore,
    private readonly options: MediaControllerOptions
  ) {
    this.sessionPersistTimer = globalThis.setInterval(() => {
      const state = this.store.getState();
      if (state.currentTrack?.filePath && state.playbackStatus !== 'idle') {
        this.persistNow();
      }
    }, 2000);
  }

  destroy(): void {
    if (this.sessionPersistTimer) globalThis.clearInterval(this.sessionPersistTimer);
    if (this.persistDebounceTimer) globalThis.clearTimeout(this.persistDebounceTimer);
    this.unbindEvents();
    this.element?.pause();
    this.element?.removeAttribute('src');
  }

  ensureElement(sink: HTMLElement): HTMLVideoElement {
    if (this.element && this.sink === sink) return this.element;

    if (!this.element) {
      this.element = document.createElement('video');
      this.element.className = 'prism-media-engine';
      this.element.controls = false;
      this.element.preload = 'auto';
      this.element.playsInline = true;
      this.element.disablePictureInPicture = true;
      this.bindEvents();
    }

    this.sink = sink;
    if (!sink.contains(this.element)) sink.appendChild(this.element);
    return this.element;
  }

  getElement(): HTMLVideoElement | null {
    return this.element;
  }

  attachPreviewHost(host: HTMLElement | null): void {
    if (host === this.previewHost) return;

    if (this.element && this.previewHost && this.previewHost !== host) {
      try {
        if (this.previewHost.contains(this.element)) {
          this.previewHost.removeChild(this.element);
        }
      } catch {
        // host may already be detached from DOM
      }
    }

    this.previewHost = host;
    if (!this.element) return;

    if (host) {
      if (!host.contains(this.element)) host.appendChild(this.element);
      this.element.classList.remove('prism-media-engine--hidden');
      return;
    }

    if (this.sink) {
      if (!this.sink.contains(this.element)) this.sink.appendChild(this.element);
      this.element.classList.add('prism-media-engine--hidden');
    }
  }

  private syncFromElement(): void {
    const element = this.element;
    const state = this.store.getState();
    if (!element || !state.currentTrack?.filePath) return;

    const duration = Number.isFinite(element.duration) && element.duration > 0 ? element.duration : state.duration;
    let playbackStatus: PlaybackStatus = 'paused';

    if (element.ended) playbackStatus = 'ended';
    else if (element.error) playbackStatus = 'error';
    else if ((this.seeking || element.seeking) && !element.paused) playbackStatus = 'playing';
    else if (element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA && !element.paused) playbackStatus = 'loading';
    else if (!element.paused) playbackStatus = 'playing';
    else playbackStatus = 'paused';

    let bufferedEnd = 0;
    if (element.buffered.length > 0) {
      bufferedEnd = element.buffered.end(element.buffered.length - 1);
    }

    this.store.patch({
      currentTime: element.currentTime,
      duration,
      volume: element.volume,
      muted: element.muted,
      playbackRate: element.playbackRate,
      playbackStatus,
      bufferedEnd
    });
  }

  private bindEvents(): void {
    if (!this.element || this.listenersBound) return;
    const element = this.element;

    const onSync = () => {
      if (element.error) {
        const info = describeMediaError(element, this.store.getState().currentTrack, this.options.translateError);
        this.store.patch({
          playbackStatus: 'error',
          error: info.userMessage,
          errorTechnical: info.technical
        });
        return;
      }
      this.syncFromElement();
    };

    element.addEventListener('play', onSync);
    element.addEventListener('playing', onSync);
    element.addEventListener('pause', () => {
      onSync();
      this.persistNow();
    });
    element.addEventListener('waiting', onSync);
    element.addEventListener('canplay', onSync);
    element.addEventListener('loadedmetadata', onSync);
    element.addEventListener('durationchange', onSync);
    element.addEventListener('seeking', () => {
      this.seeking = true;
      onSync();
    });
    element.addEventListener('seeked', () => {
      this.seeking = false;
      onSync();
      this.persistNow();
    });
    element.addEventListener('timeupdate', () => {
      if (this.seeking) return;
      onSync();
    });
    element.addEventListener('progress', onSync);
    element.addEventListener('ratechange', onSync);
    element.addEventListener('volumechange', onSync);
    element.addEventListener('error', onSync);
    element.addEventListener('ended', () => {
      onSync();
      this.options.onEnded?.();
    });

    this.listenersBound = true;
  }

  private unbindEvents(): void {
    this.listenersBound = false;
  }

  persistNow(): void {
    const { currentTrack, currentTime, duration, volume, muted, playbackRate } = this.store.getState();
    if (!currentTrack?.id || !currentTrack.filePath) return;
    savePlaybackSession({
      mediaId: currentTrack.id,
      filePath: currentTrack.filePath,
      positionSeconds: currentTime,
      durationSeconds: duration,
      volume,
      muted,
      playbackRate
    });
    this.options.onPersist?.();
  }

  private schedulePersist(delayMs = 400): void {
    if (this.persistDebounceTimer) globalThis.clearTimeout(this.persistDebounceTimer);
    this.persistDebounceTimer = globalThis.setTimeout(() => {
      this.persistDebounceTimer = undefined;
      this.persistNow();
    }, delayMs);
  }

  async loadTrack(track: MediaItem, opts: LoadTrackOptions = {}): Promise<void> {
    if (!track.filePath) {
      this.store.patch({ playbackStatus: 'error', error: this.options.translateError('error.media.missing') });
      return;
    }

    const generation = ++this.loadGeneration;
    const autoPlay = opts.autoPlay ?? true;
    const startSeconds = opts.startSeconds ?? 0;
    const previous = this.store.getState();
    const sameTrack = previous.currentTrack?.id === track.id
      && previous.currentTrack?.filePath === track.filePath;

    if (sameTrack && this.element) {
      const cachedUrl = peekResolvedMediaUrl(track.filePath);
      const urlReady = cachedUrl
        ? this.element.src === cachedUrl
        : await resolveMediaUrl(track.filePath).then((url) => url.length > 0 && this.element?.src === url).catch(() => false);

      if (
        urlReady
        && this.element.readyState >= HTMLMediaElement.HAVE_METADATA
        && generation === this.loadGeneration
      ) {
        this.store.patch({
          currentTrack: track,
          selectedTrackId: track.id,
          isVideo: track.kind === 'video',
          isPreviewVisible: track.kind === 'video',
          playbackStatus: previous.playbackStatus === 'loading' ? 'paused' : previous.playbackStatus,
          error: null,
          errorTechnical: null,
        });
        configureMediaElement(
          this.element,
          previous.volume,
          previous.playbackRate,
          opts.muted ?? previous.muted
        );
        try {
          if (autoPlay && this.element.paused) {
            await this.element.play();
          } else if (!autoPlay) {
            this.element.pause();
          }
          if (startSeconds > 0 && generation === this.loadGeneration) {
            this.element.currentTime = startSeconds;
          }
          if (generation !== this.loadGeneration) return;
          clearMediaPlaybackHealth(track.id);
          this.syncFromElement();
          this.persistNow();
        } catch (error) {
          if (generation !== this.loadGeneration) return;
          const info = describeMediaError(this.element, track, this.options.translateError);
          if (track?.id) {
            markMediaPlaybackFailed(track.id, classifyPlaybackErrorMessage(info.userMessage), info.userMessage);
          }
          this.store.patch({
            playbackStatus: 'error',
            error: info.userMessage,
            errorTechnical: info.technical
          });
          console.error('[Virelia playback] resume failed', error);
        }
        return;
      }
    }

    this.store.patch({
      currentTrack: track,
      selectedTrackId: track.id,
      isVideo: track.kind === 'video',
      isPreviewVisible: track.kind === 'video',
      playbackStatus: 'loading',
      error: null,
      errorTechnical: null,
      currentTime: 0,
      duration: track.durationSeconds ?? 0
    });

    if (!this.element || !this.sink) {
      this.store.patch({ playbackStatus: 'error', error: this.options.translateError('error.media.unknown') });
      return;
    }

    cancelHtmlPlaybackLoads();
    this.element.pause();
    this.element.removeAttribute('src');

    const prism = getPrism();
    void prism?.playback.stopExternal().catch(() => undefined);
    void prism?.playback.play(track.id, track.filePath, {
      forceEngine: 'html5-fallback',
      autoPlay: false
    }).catch(() => undefined);

    if (generation !== this.loadGeneration) return;

    const state = this.store.getState();
    try {
      configureMediaElement(this.element, state.volume, state.playbackRate, opts.muted ?? state.muted);

      if (autoPlay) {
        await loadAndPlayMedia(this.element, track.filePath, state.volume, state.playbackRate, state.muted);
        if (startSeconds > 0 && generation === this.loadGeneration) {
          this.element.currentTime = startSeconds;
        }
      } else {
        await loadMediaPaused(
          this.element,
          track.filePath,
          state.volume,
          state.playbackRate,
          startSeconds,
          opts.muted ?? state.muted
        );
      }

      if (generation !== this.loadGeneration) return;
      clearMediaPlaybackHealth(track.id);
      this.syncFromElement();
      this.persistNow();
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      const info = describeMediaError(this.element, track, this.options.translateError);
      if (track?.id) {
        markMediaPlaybackFailed(track.id, classifyPlaybackErrorMessage(info.userMessage), info.userMessage);
      }
      this.store.patch({
        playbackStatus: 'error',
        error: info.userMessage,
        errorTechnical: info.technical
      });
      console.error('[Virelia playback] load failed', error);
    }
  }

  async play(): Promise<void> {
    if (!this.element?.src) return;
    try {
      await this.element.play();
      this.store.patch({ error: null, errorTechnical: null });
      this.syncFromElement();
      playUiSound('play');
    } catch {
      const track = this.store.getState().currentTrack;
      const info = describeMediaError(this.element, track, this.options.translateError);
      if (track?.id) {
        markMediaPlaybackFailed(track.id, classifyPlaybackErrorMessage(info.userMessage), info.userMessage);
      }
      this.store.patch({ playbackStatus: 'error', error: info.userMessage, errorTechnical: info.technical });
    }
  }

  pause(): void {
    const wasPlaying = Boolean(this.element && !this.element.paused && !this.element.ended);
    this.element?.pause();
    this.syncFromElement();
    this.persistNow();
    if (wasPlaying) playUiSound('pause');
  }

  async togglePlayPause(): Promise<void> {
    const element = this.element;
    if (!element?.src) return;
    if (!element.paused && !element.ended) {
      this.pause();
      return;
    }
    if (element.ended) {
      element.currentTime = 0;
    }
    await this.play();
  }

  togglePlay(): void {
    void this.togglePlayPause();
  }

  async seek(seconds: number): Promise<void> {
    const element = this.element;
    if (!element?.src) return;

    const max = Number.isFinite(element.duration) && element.duration > 0 ? element.duration : seconds;
    const next = Math.max(0, Math.min(seconds, max));
    this.seeking = true;
    this.store.patch({ currentTime: next });

    if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve) => {
        const timeout = globalThis.setTimeout(resolve, 2000);
        const onReady = () => {
          globalThis.clearTimeout(timeout);
          element.removeEventListener('loadedmetadata', onReady);
          element.removeEventListener('durationchange', onReady);
          resolve();
        };
        element.addEventListener('loadedmetadata', onReady);
        element.addEventListener('durationchange', onReady);
      });
    }

    try {
      element.currentTime = next;
    } catch {
      this.seeking = false;
      this.syncFromElement();
      return;
    }

    this.syncFromElement();
    this.schedulePersist();
    playUiSound('seek');
  }

  setVolume(value: number): void {
    const volume = Math.max(0, Math.min(1, value));
    if (this.element) this.element.volume = volume;
    this.store.patch({ volume });
    void getPrism()?.playback.setVolume(volume);
    this.persistNow();
  }

  setMuted(muted: boolean): void {
    const prev = this.store.getState().muted;
    if (this.element) {
      this.element.muted = muted;
      if (muted) this.element.setAttribute('muted', '');
      else this.element.removeAttribute('muted');
    }
    this.store.patch({ muted });
    this.persistNow();
    if (prev !== muted) playUiSound('confirm');
  }

  setPlaybackRate(rate: number): void {
    const prev = this.store.getState().playbackRate;
    if (this.element) this.element.playbackRate = rate;
    this.store.patch({ playbackRate: rate });
    void getPrism()?.playback.setSpeed(rate);
    this.persistNow();
    if (prev !== rate) playUiSound('confirm');
  }

  stop(): void {
    ++this.loadGeneration;
    cancelHtmlPlaybackLoads();
    this.element?.pause();
    this.element?.removeAttribute('src');
    this.store.patch({
      playbackStatus: 'idle',
      currentTime: 0,
      bufferedEnd: 0
    });
  }

  resolveFullscreenTarget(target?: HTMLElement): HTMLElement | null {
    const node = target ?? this.previewHost ?? this.element;
    if (!node) return null;
    return node.closest('.video-stage__surface') as HTMLElement | null ?? node;
  }

  toggleFullscreen(target?: HTMLElement): void {
    const root = this.resolveFullscreenTarget(target);
    if (!root) return;
    playUiSound('mode_switch');
    void toggleDomFullscreen(root);
  }

  enterFullscreen(target?: HTMLElement): void {
    this.toggleFullscreen(target);
  }

  exitFullscreen(): void {
    void exitDomFullscreen();
  }
}
