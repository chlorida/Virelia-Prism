import type { EngineStatus, PlaybackCommandResult, PlaybackEngineName } from '../../shared/types';

export type { PlaybackCommandResult };

export interface PlaybackEngine {
  name: PlaybackEngineName;
  getStatus(): Promise<EngineStatus>;
  play(filePath: string): Promise<void>;
  resume(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(positionSeconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setSpeed(speed: number): Promise<void>;
}

