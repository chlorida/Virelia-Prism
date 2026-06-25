import type { EngineStatus } from '../../shared/types';
import type { PlaybackEngine } from './types';

export class HtmlFallbackEngine implements PlaybackEngine {
  readonly name = 'html5-fallback' as const;

  async getStatus(): Promise<EngineStatus> {
    return {
      engine: this.name,
      available: true,
      message: 'Electron HTML5 media fallback is ready for browser-supported formats.'
    };
  }

  async play(): Promise<void> {}
  async resume(): Promise<void> {}
  async pause(): Promise<void> {}
  async stop(): Promise<void> {}
  async seek(): Promise<void> {}
  async setVolume(): Promise<void> {}
  async setSpeed(): Promise<void> {}
}
