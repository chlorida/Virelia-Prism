import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EngineStatus } from '../../shared/types';
import type { PlaybackEngine } from './types';

async function canAccess(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function pathCandidates(customPath?: string): string[] {
  const candidates = [
    customPath,
    process.env.VIRELIA_PRISM_MPV_PATH
  ].filter(Boolean) as string[];

  if (os.platform() === 'win32') {
    candidates.push(
      path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'mpv', 'mpv.exe'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'mpv', 'mpv.exe')
    );
  }

  return candidates;
}

async function findOnPath(binaryNames: string[]): Promise<string | undefined> {
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    for (const binary of binaryNames) {
      const candidate = path.join(entry, binary);
      if (await canAccess(candidate)) return candidate;
    }
  }
  return undefined;
}

export class MpvPlaybackEngine implements PlaybackEngine {
  readonly name = 'mpv' as const;
  private process?: ChildProcessWithoutNullStreams;
  private resolvedPath?: string;

  constructor(private readonly configuredPath?: string) {}

  async getStatus(): Promise<EngineStatus> {
    const executablePath = await this.resolveExecutable();
    if (!executablePath) {
      return {
        engine: this.name,
        available: false,
        message: 'mpv.exe was not found. Install mpv or set VIRELIA_PRISM_MPV_PATH to enable universal playback.'
      };
    }

    return {
      engine: this.name,
      available: true,
      executablePath,
      message: 'mpv engine is available for universal playback.'
    };
  }

  async play(filePath: string): Promise<void> {
    await this.ensureProcess();
    const target = JSON.stringify(pathToFileURL(path.normalize(filePath)).href);
    this.writeCommand(`loadfile ${target} replace`);
  }

  async pause(): Promise<void> {
    this.writeCommand('cycle pause');
  }

  async resume(): Promise<void> {
    this.writeCommand('set pause no');
  }

  async stop(): Promise<void> {
    this.writeCommand('stop');
  }

  async seek(positionSeconds: number): Promise<void> {
    this.writeCommand(`seek ${Math.max(0, positionSeconds)} absolute`);
  }

  async setVolume(volume: number): Promise<void> {
    this.writeCommand(`set volume ${Math.round(Math.max(0, Math.min(1, volume)) * 100)}`);
  }

  async setSpeed(speed: number): Promise<void> {
    this.writeCommand(`set speed ${Math.max(0.25, Math.min(4, speed))}`);
  }

  dispose(): void {
    if (!this.process) return;
    const child = this.process;
    this.process = undefined;
    if (!child.killed) {
      child.kill();
    }
  }

  private async resolveExecutable(): Promise<string | undefined> {
    if (this.resolvedPath) return this.resolvedPath;

    for (const candidate of pathCandidates(this.configuredPath)) {
      if (candidate && await canAccess(candidate)) {
        this.resolvedPath = candidate;
        return candidate;
      }
    }

    const pathBinary = await findOnPath(os.platform() === 'win32' ? ['mpv.exe', 'mpv.cmd', 'mpv.bat'] : ['mpv']);
    if (pathBinary) {
      this.resolvedPath = pathBinary;
      return pathBinary;
    }

    return undefined;
  }

  private async ensureProcess(): Promise<void> {
    if (this.process && this.process.exitCode === null && !this.process.killed) return;

    if (this.process) {
      this.dispose();
    }

    const executablePath = await this.resolveExecutable();
    if (!executablePath) {
      throw new Error('mpv executable is unavailable');
    }

    this.process = spawn(executablePath, [
      '--idle=yes',
      '--force-window=no',
      '--keep-open=yes',
      '--no-input-terminal',
      '--ao=wasapi'
    ], {
      windowsHide: true,
      stdio: 'pipe'
    });

    this.process.on('exit', () => {
      this.process = undefined;
    });

    this.process.on('error', () => {
      this.process = undefined;
    });
  }

  private writeCommand(command: string): void {
    if (!this.process || this.process.killed || this.process.exitCode !== null) {
      throw new Error('mpv process is not running');
    }
    const ok = this.process.stdin.write(`${command}\n`);
    if (!ok) {
      throw new Error('mpv command buffer full');
    }
  }
}
