const KEYBOARD_NAV_ATTR = 'data-keyboard-nav';

export function markKeyboardListNavigation(): void {
  document.documentElement.setAttribute(KEYBOARD_NAV_ATTR, 'true');
}

export function clearKeyboardListNavigation(): void {
  document.documentElement.removeAttribute(KEYBOARD_NAV_ATTR);
}

let pointerListenerInstalled = false;

/** Clear keyboard-nav row highlight after any pointer interaction. */
export function installKeyboardNavPointerReset(): () => void {
  if (pointerListenerInstalled) return () => undefined;
  pointerListenerInstalled = true;
  const onPointer = () => clearKeyboardListNavigation();
  document.addEventListener('pointerdown', onPointer, true);
  return () => {
    document.removeEventListener('pointerdown', onPointer, true);
    pointerListenerInstalled = false;
  };
}
