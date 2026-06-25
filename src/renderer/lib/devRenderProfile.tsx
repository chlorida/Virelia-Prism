import { useRef } from 'react';
import { isPerfEnabled } from './perf';

const renderCounts = new Map<string, number>();

export function useDevRenderCount(componentName: string): void {
  if (!isPerfEnabled() || !import.meta.env?.DEV) return;
  const countRef = useRef(0);
  countRef.current += 1;
  renderCounts.set(componentName, (renderCounts.get(componentName) ?? 0) + 1);
  if (countRef.current === 1 || countRef.current % 25 === 0) {
    console.debug(`[Virelia Render] ${componentName} renders=${countRef.current}`);
  }
}

export function dumpDevRenderCounts(): void {
  if (!isPerfEnabled()) return;
  const rows = [...renderCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return;
  console.info('[Virelia Render] —— component render counts ——');
  for (const [name, count] of rows.slice(0, 24)) {
    console.info(`  ${name}: ${count}`);
  }
}
