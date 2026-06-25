import type { LibraryScanResult } from '../../shared/types';
import type { TranslationKey } from '../../shared/i18n';

export function resolveImportResultToast(
  result: LibraryScanResult,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  if (result.folderAlreadyIndexed) {
    return t('toast.folderAlreadyIndexed');
  }
  if (result.media.length > 0) {
    return t('toast.filesAdded', { count: result.media.length });
  }
  if (result.importStats && result.importStats.skipped > 0 && result.importStats.added === 0) {
    return t('toast.noNewMediaFound');
  }
  return t('toast.noNewMediaFound');
}
