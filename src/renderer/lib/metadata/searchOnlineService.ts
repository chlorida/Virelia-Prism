import type { AppSettings } from '../../../shared/types';
import { openExternalUrl } from '../tauriCommands';

export type SearchEngineKind = AppSettings['discovery']['searchEngine'];

export function buildOnlineSearchQuery(title: string, year?: number): string {
  const parts = [title, year != null ? String(year) : '', 'streaming'].filter(Boolean);
  return parts.join(' ');
}

export function buildSearchEngineUrl(
  query: string,
  engine: SearchEngineKind,
  customTemplate?: string
): string {
  const encoded = encodeURIComponent(query);
  switch (engine) {
    case 'google':
      return `https://www.google.com/search?q=${encoded}`;
    case 'bing':
      return `https://www.bing.com/search?q=${encoded}`;
    case 'duckduckgo':
      return `https://duckduckgo.com/?q=${encoded}`;
    case 'custom':
      if (customTemplate?.includes('{query}')) {
        return customTemplate.replace('{query}', encoded);
      }
      return `https://www.google.com/search?q=${encoded}`;
    case 'default':
    default:
      return `https://www.google.com/search?q=${encoded}`;
  }
}

export async function openOnlineSearch(
  title: string,
  year: number | undefined,
  settings: AppSettings
): Promise<void> {
  const query = buildOnlineSearchQuery(title, year);
  const url = buildSearchEngineUrl(
    query,
    settings.discovery.searchEngine,
    settings.discovery.customSearchTemplate
  );
  await openExternalUrl(url);
}
