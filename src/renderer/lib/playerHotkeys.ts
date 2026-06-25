export function shouldIgnorePlayerHotkey(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], [data-ignore-player-hotkeys]')
  );
}

export function isPlayPauseKey(event: KeyboardEvent): boolean {
  return event.code === 'Space' || event.key.toLowerCase() === 'k';
}

export function isSeekKey(event: KeyboardEvent): boolean {
  return event.code === 'KeyJ' || event.code === 'KeyL';
}
