import { useEffect, useState } from 'react';
import { absorbLibraryScan } from '../features/library/libraryService';
import type { TranslationKey } from '../../shared/i18n';
import { resolveImportResultToast } from '../lib/importToast';
import { isTauriShell } from '../lib/prismAdapter';

async function absorbDroppedPaths(
  paths: string[],
  showToast: (text: string) => void,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): Promise<void> {
  if (paths.length === 0 || !window.prism) return;
  const result = await window.prism.library.importPaths(paths);
  await absorbLibraryScan(result, {
    showToast,
    t: (key) => t(key as TranslationKey),
  });
  showToast(resolveImportResultToast(result, t));
}

export function useDragDropImport(
  showToast: (text: string) => void,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
) {
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (isTauriShell()) {
      let disposed = false;
      let unlisten: (() => void) | undefined;

      void (async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        if (disposed) return;
        unlisten = await getCurrentWindow().onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === 'enter' || payload.type === 'over') {
            setDragActive(true);
            return;
          }
          if (payload.type === 'leave') {
            setDragActive(false);
            return;
          }
          if (payload.type === 'drop') {
            setDragActive(false);
            void absorbDroppedPaths(payload.paths, showToast, t).catch(() => {
              showToast(t('toast.dropFailed'));
            });
          }
        });
      })();

      return () => {
        disposed = true;
        unlisten?.();
      };
    }

    let dragDepth = 0;
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setDragActive(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDragActive(false);
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = async (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth = 0;
      setDragActive(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0 || !window.prism) return;
      try {
        const result = await window.prism.library.pathsFromFiles(files);
        await absorbLibraryScan(result, {
          showToast,
          t: (key) => t(key as TranslationKey),
        });
        showToast(resolveImportResultToast(result, t));
      } catch {
        showToast(t('toast.dropFailed'));
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [showToast, t]);

  return dragActive;
}
