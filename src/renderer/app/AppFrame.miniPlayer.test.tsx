// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AppFrame mini layout', () => {
  it('does not render bottom player in dedicated mini shell branch', () => {
    const source = readFileSync(resolve(__dirname, 'AppFrame.tsx'), 'utf8');
    expect(source).toContain("shell.playerMode === 'mini'");
    expect(source).toContain('app-frame--mini-shell');
    const miniBranch = source.split("shell.playerMode === 'mini'")[1]?.split('return (')[1]?.split(');')[0] ?? '';
    expect(miniBranch).not.toContain('BottomPlayer');
  });

  it('uses dedicated mini shell instead of full app frame', () => {
    const source = readFileSync(resolve(__dirname, 'AppFrame.tsx'), 'utf8');
    expect(source).toContain('app-frame--mini-shell');
    expect(source).toContain('<MiniModeView');
  });
});
