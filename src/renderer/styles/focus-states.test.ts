import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cssPath = join(dirname(fileURLToPath(import.meta.url)), 'focus-states.css');
const css = readFileSync(cssPath, 'utf8');

describe('focus-states.css', () => {
  it('hides decorative outline on mouse focus for buttons', () => {
    expect(css).toContain('button:focus:not(:focus-visible)');
    expect(css).toContain('outline: none');
  });

  it('keeps keyboard focus-visible rings', () => {
    expect(css).toContain('button:focus-visible');
    expect(css).toContain('input:focus-visible');
  });

  it('shows media row focus only during keyboard list navigation', () => {
    expect(css).toContain('html[data-keyboard-nav] .media-row.focused');
    expect(css).toMatch(/\.media-row\.focused\s*\{[^}]*outline:\s*none/);
  });

  it('separates selected and playing row styles', () => {
    expect(css).toContain('.media-row.active:not(.playing)');
    expect(css).toContain('.media-row.playing');
  });
});
