import { isPerfEnabled, perfLog } from './perf';

export interface LibraryPerfSnapshot {
  indexReadMs?: number;
  scanTraversalMs?: number;
  metadataParseMs?: number;
  ipcEvents: number;
  storeUpdates: number;
  renderCommits: number;
  renderedRows: number;
}

const snapshot: LibraryPerfSnapshot = {
  ipcEvents: 0,
  storeUpdates: 0,
  renderCommits: 0,
  renderedRows: 0,
};

export function libraryPerfRecordIpc(): void {
  snapshot.ipcEvents += 1;
}

export function libraryPerfRecordStoreUpdate(): void {
  snapshot.storeUpdates += 1;
}

export function libraryPerfRecordRenderCommit(rowCount = 0): void {
  snapshot.renderCommits += 1;
  if (rowCount > 0) snapshot.renderedRows = rowCount;
}

export function libraryPerfSetIndexReadMs(ms: number): void {
  snapshot.indexReadMs = ms;
}

export function libraryPerfSetScanTraversalMs(ms: number): void {
  snapshot.scanTraversalMs = ms;
}

export function libraryPerfSetMetadataParseMs(ms: number): void {
  snapshot.metadataParseMs = ms;
}

export function libraryPerfReset(): void {
  snapshot.ipcEvents = 0;
  snapshot.storeUpdates = 0;
  snapshot.renderCommits = 0;
  snapshot.renderedRows = 0;
  snapshot.indexReadMs = undefined;
  snapshot.scanTraversalMs = undefined;
  snapshot.metadataParseMs = undefined;
}

export function libraryPerfSnapshot(): LibraryPerfSnapshot {
  return { ...snapshot };
}

export function libraryPerfDump(label = 'library'): void {
  if (!isPerfEnabled()) return;
  const s = libraryPerfSnapshot();
  perfLog(
    `${label} perf — indexRead=${s.indexReadMs?.toFixed(1) ?? '?'}ms scan=${s.scanTraversalMs?.toFixed(1) ?? '?'}ms metadata=${s.metadataParseMs?.toFixed(1) ?? '?'}ms ipc=${s.ipcEvents} storeUpdates=${s.storeUpdates} renderCommits=${s.renderCommits} rows=${s.renderedRows}`,
  );
}
