import { describe, expect, it } from 'vitest';
import type { PlaybackEngine } from './types';
import { PlaybackService } from './playbackService';

function engine(name: 'mpv' | 'html5-fallback', available: boolean): PlaybackEngine {
  return {
    name,
    async getStatus() {
      return {
        engine: name,
        available,
        message: available ? `${name} ready` : `${name} unavailable`
      };
    },
    async play() {},
    async resume() {},
    async pause() {},
    async stop() {},
    async seek() {},
    async setVolume() {},
    async setSpeed() {}
  };
}

describe('PlaybackService', () => {
  it('uses mpv when it is available', async () => {
    const service = await PlaybackService.create(engine('mpv', true), engine('html5-fallback', true), true);
    expect(service.state.engineStatus.engine).toBe('mpv');
  });

  it('falls back to HTML5 when mpv is unavailable', async () => {
    const service = await PlaybackService.create(engine('mpv', false), engine('html5-fallback', true), true);
    expect(service.state.engineStatus.engine).toBe('html5-fallback');
  });

  it('marks renderer playback when using HTML5 engine', async () => {
    const service = await PlaybackService.create(engine('mpv', false), engine('html5-fallback', true), false);
    const result = await service.play('track-1', 'C:\\Music\\song.mp3');
    expect(result.rendererPlayback).toBe(true);
    expect(service.getActiveEngine()).toBe('html5-fallback');
    expect(service.state.playing).toBe(false);
  });

  it('falls back to HTML5 when mpv play fails', async () => {
    const mpv = engine('mpv', true);
    mpv.play = async () => {
      throw new Error('mpv failed');
    };
    const service = await PlaybackService.create(mpv, engine('html5-fallback', true), true);
    const result = await service.play('track-1', 'C:\\Music\\song.mp3');
    expect(result.rendererPlayback).toBe(true);
    expect(service.getActiveEngine()).toBe('html5-fallback');
  });

  it('falls back to HTML5 when forceEngine mpv is unavailable', async () => {
    const service = await PlaybackService.create(engine('mpv', false), engine('html5-fallback', true), true);
    const result = await service.play('track-1', 'C:\\Music\\song.mp3', { forceEngine: 'mpv' });
    expect(result.rendererPlayback).toBe(true);
  });

  it('routes pause to html5 state without calling mpv', async () => {
    const mpv = engine('mpv', true);
    let mpvPaused = false;
    mpv.pause = async () => {
      mpvPaused = true;
    };
    const service = await PlaybackService.create(mpv, engine('html5-fallback', true), false);
    await service.play('track-1', 'C:\\Music\\song.mp3');
    await service.pause();
    expect(service.getActiveEngine()).toBe('html5-fallback');
    expect(mpvPaused).toBe(false);
    expect(service.state.playing).toBe(false);
  });
});
