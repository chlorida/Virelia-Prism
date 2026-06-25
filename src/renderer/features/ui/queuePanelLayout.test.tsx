// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QueuePanel } from '../../components/QueuePanel';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

const baseProps = {
  queue: [],
  history: [],
  mediaById: new Map(),
  onPlay: () => undefined,
  onRemove: () => undefined,
  onClear: () => undefined,
  onReorder: () => undefined,
  onTogglePin: () => undefined
};

describe('queue panel layout', () => {
  it('renders docked presentation class', () => {
    const html = renderToStaticMarkup(
      createElement(QueuePanel, { ...baseProps, presentation: 'docked' })
    );
    expect(html).toContain('queue-panel--docked');
    expect(html).toContain('queue.tab.queue');
    expect(html).toContain('queue.empty.title');
  });

  it('renders drawer presentation class', () => {
    const html = renderToStaticMarkup(
      createElement(QueuePanel, { ...baseProps, presentation: 'drawer' })
    );
    expect(html).toContain('queue-panel--drawer');
  });

  it('disables Clear when queue is empty', () => {
    const html = renderToStaticMarkup(createElement(QueuePanel, { ...baseProps, presentation: 'drawer' }));
    expect(html).toContain('disabled');
    expect(html).toContain('queue.clear');
  });
});
