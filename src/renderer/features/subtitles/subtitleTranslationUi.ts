import type { TranslationBackendKind } from '../../../shared/subtitleTypes';

export interface TranslationActionUi {
  canTranslate: boolean;
  disabledReasonKey?: 'subtitles.translateDisabledBackend';
  warningKey?: 'subtitles.translateMockWarning';
}

export function getTranslationActionUi(
  backend: TranslationBackendKind,
  translationAvailable: boolean,
  showTranslateButton: boolean,
): TranslationActionUi {
  if (!showTranslateButton) {
    return { canTranslate: false };
  }
  if (!translationAvailable || backend === 'disabled') {
    return { canTranslate: false, disabledReasonKey: 'subtitles.translateDisabledBackend' };
  }
  if (backend === 'mock') {
    return { canTranslate: true, warningKey: 'subtitles.translateMockWarning' };
  }
  return { canTranslate: true };
}

export function subtitleFileName(path?: string | null): string | null {
  if (!path) return null;
  const normalized = path.replace(/\\/g, '/');
  const name = normalized.split('/').pop();
  return name && name.length > 0 ? name : path;
}
