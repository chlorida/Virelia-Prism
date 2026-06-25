/** Shared helpers for YouTube-like video surface interaction. */

const INTERACTIVE_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[role="slider"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[data-video-control]',
  '[data-no-video-toggle]',
  '.video-controls__bottom',
  '.video-controls__center',
  '.player-speed-menu',
  '.progress-bar',
].join(', ');

export function isVideoInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
}

export function isHotkeyBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-ignore-player-hotkeys]')) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

import { isPseudoFullscreenActive } from '../../lib/domFullscreen';

export function isPlayerContextActive(surface: HTMLElement | null): boolean {
  if (!surface) return false;
  if (isPseudoFullscreenActive(surface)) return true;
  if (document.fullscreenElement && (document.fullscreenElement === surface || surface.contains(document.fullscreenElement))) {
    return true;
  }
  return Boolean(
    document.querySelector('.watch-page__main, .watch-stage, .video-stage-host--visible')
    || surface.matches(':hover')
    || surface.contains(document.activeElement)
  );
}
