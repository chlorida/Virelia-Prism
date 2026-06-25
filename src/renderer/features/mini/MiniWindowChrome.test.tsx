// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MiniWindowChrome } from './MiniWindowChrome';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

describe('MiniWindowChrome', () => {
  it('shows Restore and Close only (no Exit mini, no minimize)', () => {
    const html = renderToStaticMarkup(
      createElement(MiniWindowChrome, { onRestore: vi.fn(), onClose: vi.fn() })
    );
    expect(html).toContain('player.restoreWindow');
    expect(html).toContain('player.closeMini');
    expect(html).not.toContain('player.exitMini');
    expect(html).not.toContain('title.minimize');
  });
});
