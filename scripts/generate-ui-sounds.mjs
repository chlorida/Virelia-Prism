/**
 * Generates soft placeholder UI sound WAV files for Virelia Prism.
 * Run: node scripts/generate-ui-sounds.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'sounds', 'ui');

const SOUNDS = {
  play: [{ freq: 392, gain: 0.35, ms: 90 }],
  pause: [{ freq: 523, gain: 0.3, ms: 80 }],
  seek: [{ freq: 280, gain: 0.22, ms: 50 }],
  open: [{ freq: 330, gain: 0.28, ms: 100 }, { freq: 440, gain: 0.18, ms: 60, delay: 40 }],
  back: [{ freq: 440, gain: 0.26, ms: 90 }, { freq: 330, gain: 0.16, ms: 55, delay: 35 }],
  tab: [{ freq: 620, gain: 0.2, ms: 45 }],
  confirm: [{ freq: 523, gain: 0.28, ms: 100 }, { freq: 659, gain: 0.18, ms: 60, delay: 40 }],
  success: [{ freq: 440, gain: 0.3, ms: 140 }, { freq: 554, gain: 0.2, ms: 90, delay: 50 }],
  warning: [{ freq: 311, gain: 0.3, ms: 120 }, { freq: 370, gain: 0.18, ms: 60, delay: 60 }],
  error: [{ freq: 196, gain: 0.32, ms: 130 }, { freq: 165, gain: 0.2, ms: 70, delay: 60 }],
  queue_add: [{ freq: 494, gain: 0.26, ms: 70 }, { freq: 587, gain: 0.16, ms: 40, delay: 30 }],
  queue_remove: [{ freq: 494, gain: 0.22, ms: 70 }, { freq: 370, gain: 0.14, ms: 40, delay: 30 }],
  mode_switch: [{ freq: 350, gain: 0.24, ms: 110 }, { freq: 466, gain: 0.16, ms: 60, delay: 50 }],
};

function createWav(tones, sampleRate = 44100) {
  const totalMs = Math.max(...tones.map((t) => (t.delay ?? 0) + t.ms));
  const samples = Math.floor((totalMs / 1000) * sampleRate);
  const data = new Float32Array(samples);

  for (const tone of tones) {
    const start = Math.floor(((tone.delay ?? 0) / 1000) * sampleRate);
    const len = Math.floor((tone.ms / 1000) * sampleRate);
    for (let i = 0; i < len; i += 1) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 14);
      data[start + i] += Math.sin(2 * Math.PI * tone.freq * t) * env * tone.gain;
    }
  }

  let peak = 0;
  for (let i = 0; i < samples; i += 1) peak = Math.max(peak, Math.abs(data[i]));
  const scale = peak > 0 ? 0.85 / peak : 1;

  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);

  for (let i = 0; i < samples; i += 1) {
    const v = Math.max(-1, Math.min(1, data[i] * scale));
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buffer;
}

mkdirSync(outDir, { recursive: true });
for (const [name, tones] of Object.entries(SOUNDS)) {
  const path = join(outDir, `ui_${name}.wav`);
  writeFileSync(path, createWav(tones));
  console.log('wrote', path);
}
