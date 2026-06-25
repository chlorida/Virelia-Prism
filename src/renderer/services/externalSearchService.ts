import { createStore } from '../lib/createStore';
import { readStored, writeStored } from '../lib/storageKeys';
import { openExternalUrl } from '../lib/tauriCommands';
import { buildOnlineSearchQuery, buildSearchEngineUrl } from '../lib/metadata/searchOnlineService';
import type { AppSettings } from '../../shared/types';

interface ExternalSearchState {
  open: boolean;
  title: string;
  year?: number;
  settings: AppSettings | null;
  resolver: ((confirmed: boolean) => void) | null;
}

export const externalSearchStore = createStore<ExternalSearchState>({
  open: false,
  title: '',
  year: undefined,
  settings: null,
  resolver: null,
});

const SKIP_KEY = 'virelia.skipBrowserSearchWarning';

function shouldSkipWarning(settings: AppSettings): boolean {
  if (!settings.discovery.askBeforeOpeningBrowser) return true;
  return readStored<boolean>(SKIP_KEY, false);
}

export function setSkipBrowserSearchWarning(skip: boolean): void {
  writeStored(SKIP_KEY, skip);
}

export async function requestExternalSearch(
  title: string,
  year: number | undefined,
  settings: AppSettings
): Promise<boolean> {
  if (shouldSkipWarning(settings)) {
    await openExternalUrl(buildSearchEngineUrl(
      buildOnlineSearchQuery(title, year),
      settings.discovery.searchEngine,
      settings.discovery.customSearchTemplate
    ));
    return true;
  }

  return new Promise((resolve) => {
    externalSearchStore.patch({
      open: true,
      title,
      year,
      settings,
      resolver: resolve,
    });
  });
}

export function confirmExternalSearch(dontShowAgain: boolean): void {
  const state = externalSearchStore.getState();
  if (dontShowAgain) setSkipBrowserSearchWarning(true);
  const settings = state.settings;
  if (settings) {
    void openExternalUrl(buildSearchEngineUrl(
      buildOnlineSearchQuery(state.title, state.year),
      settings.discovery.searchEngine,
      settings.discovery.customSearchTemplate
    ));
  }
  state.resolver?.(true);
  externalSearchStore.patch({ open: false, resolver: null, settings: null });
}

export function cancelExternalSearch(): void {
  const state = externalSearchStore.getState();
  state.resolver?.(false);
  externalSearchStore.patch({ open: false, resolver: null, settings: null });
}
