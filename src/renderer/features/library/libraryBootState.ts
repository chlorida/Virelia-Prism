export type LibraryBootState =
  | 'idle'
  | 'loadingSnapshot'
  | 'snapshotReady'
  | 'snapshotFailed'
  | 'hydratingStore'
  | 'readyFromSnapshot'
  | 'scanning'
  | 'readyAndScanning'
  | 'scanFailed'
  | 'ready'
  | 'empty'
  | 'fatalError';

export function isLibraryBootReady(state: LibraryBootState): boolean {
  return state === 'ready'
    || state === 'readyFromSnapshot'
    || state === 'readyAndScanning'
    || state === 'scanning'
    || state === 'empty';
}

export function isLibraryBlockingLoad(state: LibraryBootState, hasMedia: boolean): boolean {
  if (hasMedia) return false;
  return state === 'loadingSnapshot'
    || state === 'hydratingStore'
    || state === 'snapshotReady';
}

export function shouldShowLibraryRecovery(state: LibraryBootState): boolean {
  return state === 'snapshotFailed' || state === 'scanFailed' || state === 'fatalError';
}

export function libraryBootStatusLabel(state: LibraryBootState): string {
  switch (state) {
    case 'loadingSnapshot':
      return 'Loading library snapshot…';
    case 'snapshotFailed':
      return 'Rebuilding library index…';
    case 'hydratingStore':
      return 'Preparing library…';
    case 'scanning':
    case 'readyAndScanning':
      return 'Scanning library…';
    case 'scanFailed':
      return 'Library scan failed';
    case 'empty':
      return 'Import a folder to get started';
    case 'fatalError':
      return 'Couldn’t load library index';
    default:
      return '';
  }
}
