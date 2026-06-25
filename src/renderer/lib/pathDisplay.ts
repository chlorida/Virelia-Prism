/** Human-readable paths for UI (never show \\?\ extended prefixes). */

export function normalizeInternalPath(filePath: string): string {
  if (!filePath) return '';
  let path = filePath.trim().replace(/\//g, '\\');
  if (path.startsWith('\\\\?\\')) {
    path = path.slice(4);
  }
  while (path.endsWith('\\') && path.length > 3) {
    path = path.slice(0, -1);
  }
  return path;
}

export function isJunkFolderPath(folderPath: string): boolean {
  const normalized = normalizeInternalPath(folderPath);
  if (!normalized) return true;
  if (/\.[a-z0-9]{2,5}$/i.test(normalized)) return false;
  if (/^[A-Za-z]:\\?$/i.test(normalized)) return true;
  if (/^[A-Za-z]:$/i.test(normalized)) return true;
  return false;
}

export function formatPathForDisplay(filePath: string | undefined): string {
  if (!filePath) return '';
  const normalized = normalizeInternalPath(filePath);
  if (!normalized) return '';
  return normalized.replace(/\\/g, '/');
}

export function formatFolderLabelForDisplay(folderPath: string | undefined): string {
  if (!folderPath || isJunkFolderPath(folderPath)) return '';
  const normalized = formatPathForDisplay(folderPath);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return '';
  const last = parts[parts.length - 1] ?? '';
  if (/^[A-Za-z]:$/i.test(last) && parts.length >= 2) {
    return `…/${parts.slice(-2).join('/')}`;
  }
  if (parts.length <= 2) return normalized;
  return `…/${parts.slice(-2).join('/')}`;
}

export function formatPathForCopy(filePath: string | undefined): string {
  if (!filePath) return '';
  return normalizeInternalPath(filePath);
}
