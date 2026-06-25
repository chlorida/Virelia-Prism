/** Dev-only scroll container diagnostics (enable with localStorage prismDevScrollAudit=1). */
export function isScrollAuditEnabled(): boolean {
  return import.meta.env.DEV && localStorage.getItem('prismDevScrollAudit') === '1';
}

export function auditScrollContainer(node: HTMLElement | null, label: string): void {
  if (!isScrollAuditEnabled() || !node) return;
  document.body.classList.add('prism-debug-scroll-audit');
  const style = getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  console.debug(`[Virelia scroll] ${label}`, {
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
    canScroll: node.scrollHeight > node.clientHeight + 1,
    overflowY: style.overflowY,
    display: style.display,
    flex: style.flex,
    minHeight: style.minHeight,
    height: style.height,
    rectHeight: rect.height,
  });
}
