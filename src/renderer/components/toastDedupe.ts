import type { ToastMessage, ToastOptions } from './ToastStack';

export function upsertToastMessage(
  items: ToastMessage[],
  text: string,
  opts: ToastOptions
): ToastMessage[] {
  const id = opts.key ? `toast-key-${opts.key}` : `toast-${Date.now()}`;
  const withoutDupes = opts.key
    ? items.filter((item) => item.dedupeKey !== opts.key)
    : items;
  return [...withoutDupes, { id, text, dedupeKey: opts.key }];
}
