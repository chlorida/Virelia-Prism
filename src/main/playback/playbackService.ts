import type { PlaybackEngineName, PlaybackState, RepeatMode, PlayMediaOptions } from '../../shared/types';
import type { PlaybackCommandResult, PlaybackEngine } from './types';

export type { PlayMediaOptions };

export class PlaybackService {
  private currentFilePath?: string;
  private activeEngine?: PlaybackEngineName;

  private constructor(
    private readonly mpvEngine: PlaybackEngine,
    private readonly fallbackEngine: PlaybackEngine,
    private readonly preferMpv: boolean,
    public readonly state: PlaybackState
  ) {}

  static async create(
    mpvEngine: PlaybackEngine,
    fallbackEngine: PlaybackEngine,
    preferMpv: boolean,
    initial?: Pick<PlaybackState, 'volume' | 'speed'>
  ): Promise<PlaybackService> {
    const mpvStatus = await mpvEngine.getStatus();
    const fallbackStatus = await fallbackEngine.getStatus();
    const engineStatus = mpvStatus.available ? mpvStatus : fallbackStatus;

    return new PlaybackService(mpvEngine, fallbackEngine, preferMpv, {
      playing: false,
      positionSeconds: 0,
      volume: initial?.volume ?? 0.74,
      speed: initial?.speed ?? 1,
      repeat: 'off',
      shuffle: false,
      engineStatus
    });
  }

  getActiveEngine(): PlaybackEngineName | undefined {
    return this.activeEngine;
  }

  async refreshEngineStatus(): Promise<PlaybackState> {
    const mpvStatus = await this.mpvEngine.getStatus();
    this.state.engineStatus = mpvStatus.available ? mpvStatus : await this.fallbackEngine.getStatus();
    return this.state;
  }

  async play(mediaId: string, filePath: string, options?: PlayMediaOptions): Promise<PlaybackCommandResult> {
    const engines = await this.resolveEngines(options?.forceEngine);
    let lastError: unknown;

    for (const engine of engines) {
      if (engine.name === 'html5-fallback') {
        if (this.activeEngine === 'mpv') {
          await this.mpvEngine.stop().catch(() => undefined);
        }
        this.activeEngine = 'html5-fallback';
        this.currentFilePath = filePath;
        this.state.currentMediaId = mediaId;
        this.state.playing = false;
        if (options?.autoPlay !== false) {
          this.state.positionSeconds = 0;
        }
        this.state.engineStatus = await engine.getStatus();
        return { accepted: true, engineStatus: this.state.engineStatus, rendererPlayback: true };
      }

      try {
        if (this.activeEngine === 'html5-fallback') {
          // Renderer stops HTML5; main only tracks mpv from here.
        }
        await engine.play(filePath);
        this.activeEngine = 'mpv';
        this.currentFilePath = filePath;
        this.state.currentMediaId = mediaId;
        this.state.playing = true;
        this.state.positionSeconds = 0;
        this.state.engineStatus = await engine.getStatus();
        return { accepted: true, engineStatus: this.state.engineStatus, rendererPlayback: false };
      } catch (error) {
        lastError = error;
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'No playback engine could start this file';
    throw new Error(message);
  }

  async pause(): Promise<PlaybackState> {
    if (this.activeEngine === 'html5-fallback') {
      this.state.playing = false;
      return this.state;
    }
    await (await this.currentEngine()).pause();
    this.state.playing = false;
    return this.state;
  }

  async toggle(): Promise<PlaybackState> {
    if (this.activeEngine === 'html5-fallback') {
      this.state.playing = !this.state.playing;
      return this.state;
    }
    if (this.state.playing) return this.pause();
    const engine = await this.currentEngine();
    if (this.currentFilePath) await engine.resume();
    this.state.playing = true;
    this.state.engineStatus = await engine.getStatus();
    return this.state;
  }

  async seek(positionSeconds: number): Promise<PlaybackState> {
    if (this.activeEngine === 'html5-fallback') {
      this.state.positionSeconds = Math.max(0, positionSeconds);
      return this.state;
    }
    await (await this.currentEngine()).seek(positionSeconds);
    this.state.positionSeconds = Math.max(0, positionSeconds);
    return this.state;
  }

  async setVolume(volume: number): Promise<PlaybackState> {
    const nextVolume = Math.max(0, Math.min(1, volume));
    if (this.activeEngine !== 'html5-fallback') {
      await (await this.currentEngine()).setVolume(nextVolume);
    }
    this.state.volume = nextVolume;
    return this.state;
  }

  async setSpeed(speed: number): Promise<PlaybackState> {
    const nextSpeed = Math.max(0.25, Math.min(4, speed));
    if (this.activeEngine !== 'html5-fallback') {
      await (await this.currentEngine()).setSpeed(nextSpeed);
    }
    this.state.speed = nextSpeed;
    return this.state;
  }

  async stopExternalPlayback(): Promise<void> {
    if (this.activeEngine === 'mpv') {
      await this.mpvEngine.stop().catch(() => undefined);
    }
    this.state.playing = false;
  }

  setRepeat(repeat: RepeatMode): PlaybackState {
    this.state.repeat = repeat;
    return this.state;
  }

  setShuffle(shuffle: boolean): PlaybackState {
    this.state.shuffle = shuffle;
    return this.state;
  }

  getState(): PlaybackState {
    return this.state;
  }

  private engineByName(name: PlaybackEngineName): PlaybackEngine {
    return name === 'mpv' ? this.mpvEngine : this.fallbackEngine;
  }

  private async currentEngine(): Promise<PlaybackEngine> {
    if (this.activeEngine) return this.engineByName(this.activeEngine);
    const engines = await this.resolveEngines();
    return engines[0] ?? this.fallbackEngine;
  }

  private async resolveEngines(forceEngine?: PlaybackEngineName): Promise<PlaybackEngine[]> {
    const mpvStatus = await this.mpvEngine.getStatus();

    if (forceEngine === 'mpv') {
      return mpvStatus.available ? [this.mpvEngine] : [this.fallbackEngine];
    }

    if (forceEngine === 'html5-fallback') {
      return [this.fallbackEngine];
    }

    if (this.preferMpv && mpvStatus.available) {
      return [this.mpvEngine, this.fallbackEngine];
    }

    return [this.fallbackEngine];
  }
}
