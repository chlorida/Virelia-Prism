const LIBRARY_SCROLL_SELECTOR = '.media-workspace__list--library-scroll';

/** Reset the main library column scroll position after route changes. */
export function resetLibraryMainScroll(): void {
  if (typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    document.querySelectorAll(LIBRARY_SCROLL_SELECTOR).forEach((node) => {
      const element = node as HTMLElement;
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
  });
}
