import { isTauriShell } from '../../lib/prismAdapter';
import { getLibraryBootPaths } from '../../lib/tauriCommands';

export type LibraryBootLogLevel = 'info' | 'warn' | 'error';

const lines: string[] = [];

export function libraryBootLog(
  message: string,
  detail?: Record<string, string | number | boolean | null | undefined>
): void {
  const suffix = detail
    ? ' ' + Object.entries(detail)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(' ')
    : '';
  const line = `[Virelia LibraryBoot] ${message}${suffix}`;
  lines.push(line);
  console.info(line);
}

export function getLibraryBootLogLines(): string[] {
  return [...lines];
}

export function copyLibraryBootDiagnostics(): string {
  return lines.join('\n');
}

export async function logLibraryBootPaths(): Promise<void> {
  libraryBootLog('shell', { tauri: isTauriShell() });
  if (!isTauriShell()) {
    libraryBootLog('cache paths', { note: 'electron uses userData/library-index-cache.json' });
    return;
  }
  try {
    const paths = await getLibraryBootPaths();
    libraryBootLog('appDataDir', { path: paths.appDataDir });
    libraryBootLog('snapshot path', { path: paths.snapshotFile });
    libraryBootLog('snapshot backup', { path: paths.snapshotBackupFile });
    libraryBootLog('legacy cache', { path: paths.legacyCacheFile });
  } catch (error) {
    libraryBootLog('paths failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
