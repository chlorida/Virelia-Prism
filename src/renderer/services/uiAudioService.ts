import {
  UI_IMPORTANT_DURING_PLAYBACK,
  UI_SOUND_CATEGORY_BY_ID,
  UI_SOUND_IDS,
  defaultUiSoundsSettings,
  type UiSoundId,
  type UiSoundsSettings,
} from '../../shared/uiAudioTypes';

type ToneStep = { freq: number; at: number; gain: number };

interface SoundProfile {
  duration: number;
  tones: ToneStep[];
}

const SOUND_PROFILES: Record<UiSoundId, SoundProfile> = {
  play: { duration: 0.09, tones: [{ freq: 392, at: 0, gain: 0.55 }, { freq: 523, at: 0.03, gain: 0.35 }] },
  pause: { duration: 0.08, tones: [{ freq: 523, at: 0, gain: 0.45 }, { freq: 392, at: 0.025, gain: 0.3 }] },
  seek: { duration: 0.05, tones: [{ freq: 280, at: 0, gain: 0.35 }] },
  open: { duration: 0.1, tones: [{ freq: 330, at: 0, gain: 0.4 }, { freq: 440, at: 0.04, gain: 0.28 }] },
  back: { duration: 0.09, tones: [{ freq: 440, at: 0, gain: 0.38 }, { freq: 330, at: 0.035, gain: 0.25 }] },
  tab: { duration: 0.045, tones: [{ freq: 620, at: 0, gain: 0.3 }] },
  confirm: { duration: 0.1, tones: [{ freq: 523, at: 0, gain: 0.4 }, { freq: 659, at: 0.04, gain: 0.28 }] },
  success: { duration: 0.14, tones: [{ freq: 440, at: 0, gain: 0.42 }, { freq: 554, at: 0.05, gain: 0.32 }, { freq: 659, at: 0.09, gain: 0.2 }] },
  warning: { duration: 0.12, tones: [{ freq: 311, at: 0, gain: 0.42 }, { freq: 370, at: 0.06, gain: 0.28 }] },
  error: { duration: 0.13, tones: [{ freq: 196, at: 0, gain: 0.45 }, { freq: 165, at: 0.06, gain: 0.3 }] },
  queue_add: { duration: 0.07, tones: [{ freq: 494, at: 0, gain: 0.38 }, { freq: 587, at: 0.03, gain: 0.22 }] },
  queue_remove: { duration: 0.07, tones: [{ freq: 494, at: 0, gain: 0.32 }, { freq: 370, at: 0.03, gain: 0.22 }] },
  mode_switch: { duration: 0.11, tones: [{ freq: 350, at: 0, gain: 0.35 }, { freq: 466, at: 0.05, gain: 0.25 }] },
};

const FILE_URLS: Partial<Record<UiSoundId, string>> = Object.fromEntries(
  UI_SOUND_IDS.map((id) => [id, `/sounds/ui/ui_${id}.wav`])
) as Partial<Record<UiSoundId, string>>;

class UiAudioService {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers = new Map<UiSoundId, AudioBuffer>();
  private settings: UiSoundsSettings = defaultUiSoundsSettings();
  private mediaPlaying = false;
  private preloadStarted = false;
  private reducedMotion = false;

  configure(settings: UiSoundsSettings): void {
    this.settings = settings;
    if (this.masterGain) {
      this.masterGain.gain.value = this.effectiveMasterGain();
    }
  }

  setMediaPlaying(playing: boolean): void {
    this.mediaPlaying = playing;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (this.masterGain) {
      this.masterGain.gain.value = this.effectiveMasterGain();
    }
  }

  preload(): void {
    if (this.preloadStarted || typeof window === 'undefined') return;
    this.preloadStarted = true;
    const run = () => {
      void this.ensureContext();
      void Promise.all(UI_SOUND_IDS.map((id) => this.loadSound(id))).catch(() => undefined);
    };
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      globalThis.setTimeout(run, 400);
    }
  }

  playUiSound(id: UiSoundId): void {
    if (!this.settings.enabled) return;
    if (!this.shouldPlay(id)) return;
    void this.playInternal(id);
  }

  private shouldPlay(id: UiSoundId): boolean {
    const category = UI_SOUND_CATEGORY_BY_ID[id];
    if (!this.settings.categories[category]) return false;

    if (this.mediaPlaying) {
      if (this.settings.duringPlayback === 'disabled') return false;
      if (this.settings.duringPlayback === 'important_only' && !UI_IMPORTANT_DURING_PLAYBACK.has(id)) {
        return false;
      }
    }
    return true;
  }

  private effectiveMasterGain(): number {
    const base = Math.max(0, Math.min(1, this.settings.volume));
    return this.reducedMotion ? base * 0.5 : base;
  }

  private async ensureContext(): Promise<AudioContext | null> {
    if (typeof window === 'undefined') return null;
    if (!this.context || this.context.state === 'closed') {
      const Ctx = window.AudioContext
        ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.context = new Ctx();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.effectiveMasterGain();
      this.masterGain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        return null;
      }
    }
    return this.context;
  }

  private async loadSound(id: UiSoundId): Promise<void> {
    if (this.buffers.has(id)) return;
    const url = FILE_URLS[id];
    const ctx = await this.ensureContext();
    if (!ctx) return;

    if (url) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.arrayBuffer();
          const buffer = await ctx.decodeAudioData(data.slice(0));
          this.buffers.set(id, buffer);
          return;
        }
      } catch {
        // fall through to synthesis
      }
    }

    this.buffers.set(id, this.synthesize(id, ctx));
  }

  private synthesize(id: UiSoundId, ctx: AudioContext): AudioBuffer {
    const profile = SOUND_PROFILES[id];
    const sampleRate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * profile.duration));
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (const tone of profile.tones) {
      const start = Math.floor(tone.at * sampleRate);
      const toneLength = length - start;
      for (let i = 0; i < toneLength; i += 1) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 14);
        const sample = Math.sin(2 * Math.PI * tone.freq * t) * env * tone.gain;
        data[start + i] += sample;
      }
    }

    let peak = 0;
    for (let i = 0; i < length; i += 1) {
      peak = Math.max(peak, Math.abs(data[i]));
    }
    if (peak > 0.95) {
      const scale = 0.9 / peak;
      for (let i = 0; i < length; i += 1) data[i] *= scale;
    }
    return buffer;
  }

  private async playInternal(id: UiSoundId): Promise<void> {
    const ctx = await this.ensureContext();
    if (!ctx || !this.masterGain) return;

    if (!this.buffers.has(id)) {
      await this.loadSound(id);
    }
    const buffer = this.buffers.get(id);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain);
    source.start(0);
    source.onended = () => {
      try {
        source.disconnect();
      } catch {
        // ignore
      }
    };
  }
}

export const uiAudioService = new UiAudioService();

export function playUiSound(id: UiSoundId): void {
  uiAudioService.playUiSound(id);
}

export function configureUiAudio(settings: UiSoundsSettings): void {
  uiAudioService.configure(settings);
}

export function preloadUiSounds(): void {
  uiAudioService.preload();
}
