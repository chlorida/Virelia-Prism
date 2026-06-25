// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AnimatedListItem } from './AnimatedListItem';

function renderItem(props: {
  itemKey: string;
  present?: boolean;
  onExitComplete?: () => void;
  children?: React.ReactNode;
}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        AnimatedListItem,
        {
          itemKey: props.itemKey,
          present: props.present,
          onExitComplete: props.onExitComplete,
          children: props.children ?? createElement('article', { className: 'queue-item' }, 'Track'),
        },
      ),
    );
  });
  return { container, root };
}

describe('AnimatedListItem', () => {
  it('applies enter class on mount', () => {
    const { container, root } = renderItem({ itemKey: 'a' });
    expect(container.querySelector('.prism-motion-list-enter')).toBeTruthy();
    expect(container.textContent).toContain('Track');
    act(() => root.unmount());
    container.remove();
  });

  it('calls onExitComplete when present becomes false', () => {
    vi.useFakeTimers();
    const onExitComplete = vi.fn();
    const { container, root } = renderItem({
      itemKey: 'a',
      present: true,
      onExitComplete,
    });

    act(() => {
      root.render(
        createElement(AnimatedListItem, {
          itemKey: 'a',
          present: false,
          onExitComplete,
          children: createElement('article', null, 'Track'),
        }),
      );
    });

    expect(container.querySelector('.prism-motion-list-exit')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(onExitComplete).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });
});
