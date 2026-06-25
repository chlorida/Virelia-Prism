import path from 'node:path';

let allowedRoots: string[] = [];

export function setMediaAllowlist(folders: string[]): void {
  allowedRoots = folders.map((folder) => path.resolve(path.normalize(folder)));
}

export function addMediaAllowlistRoot(root: string): void {
  const normalized = path.resolve(path.normalize(root));
  if (!allowedRoots.includes(normalized)) allowedRoots.push(normalized);
}

export function isMediaPathAllowed(filePath: string): boolean {
  if (allowedRoots.length === 0) return false;

  const normalized = path.resolve(path.normalize(filePath));
  return allowedRoots.some((root) => {
    const relative = path.relative(root, normalized);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
}
