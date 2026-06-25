import { useEffect } from 'react';
import {
  LIBRARY_SCAN_BEGIN,
  LIBRARY_SCAN_END,
  type LibraryScanEndDetail
} from '../../lib/prismLibraryScanBridge';
import { LibraryToastCoordinator } from '../../lib/libraryToast';
import type { TranslationKey } from '../../../shared/i18n';

const libraryToast = new LibraryToastCoordinator();

export function useLibraryScanEvents(
  showToast: (text: string) => void,
  t: (key: TranslationKey) => string
): void {
  useEffect(() => {
    const onScanBegin = () => {
      libraryToast.begin(showToast, t('toast.libraryScanning'));
    };
    const onScanEnd = (event: Event) => {
      const detail = (event as CustomEvent<LibraryScanEndDetail>).detail;
      if (detail?.ok === false) {
        libraryToast.fail(showToast, detail.error ?? t('toast.dropFailed'));
        return;
      }
      libraryToast.finish(showToast, t('toast.libraryUpdated'));
    };
    window.addEventListener(LIBRARY_SCAN_BEGIN, onScanBegin);
    window.addEventListener(LIBRARY_SCAN_END, onScanEnd);
    return () => {
      window.removeEventListener(LIBRARY_SCAN_BEGIN, onScanBegin);
      window.removeEventListener(LIBRARY_SCAN_END, onScanEnd);
    };
  }, [showToast, t]);
}
