import { describe, expect, it } from 'vitest';
import { upsertToastMessage } from './toastDedupe';

describe('toast deduplication', () => {
  it('replaces an existing toast with the same key', () => {
    const first = upsertToastMessage([], 'Scanning...', { key: 'library-sync' });
    const second = upsertToastMessage(first, 'Library updated', { key: 'library-sync' });

    expect(second).toHaveLength(1);
    expect(second[0]?.text).toBe('Library updated');
    expect(second[0]?.id).toBe('toast-key-library-sync');
  });

  it('does not stack duplicate keyed toasts', () => {
    let messages = upsertToastMessage([], 'Library updated', { key: 'library-sync' });
    for (let i = 0; i < 4; i += 1) {
      messages = upsertToastMessage(messages, 'Library updated', { key: 'library-sync' });
    }
    expect(messages).toHaveLength(1);
  });
});
