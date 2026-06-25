import { dumpDevRenderCounts } from './devRenderProfile';
import { libraryPerfDump } from './libraryPerf';
import { getPerfBuildMode, isPerfEnabled, perfElapsedMs, perfLog, perfMark, perfMeasure } from './perf';



const REPORT_LABELS: Record<string, string> = {

  'shell:rendered': 'shellVisible',

  'library:snapshot:loaded': 'snapshotLoaded',

  'library:counts:visible': 'cachedCountsVisible',

  'library:firstRows:rendered': 'firstRowsVisible',

  'library:usable': 'usableUI',

  'library-bootstrap': 'libraryBootstrap',

  'library-sort-deferred': 'deferredSort',

  'library:scan': 'scanComplete',

  'intelligence:warm': 'smartWarm',

  'thumbnail:first': 'firstThumbnail',

  'watch:enter': 'watchEnter',

  'watch:exit': 'watchExit',

  'video:switch': 'videoSwitch',

  'video-switch-intent': 'videoSwitchIntent',

  'renderer-bootstrap-to-shell': 'initToShell',

};



export function perfMarkAppInit(): void {

  perfMark('app:init:start');

  perfMark('process:start');

  perfMark('renderer:init');

  perfMark('app-bootstrap-start');

  if (isPerfEnabled()) {

    perfLog(`mode=${getPerfBuildMode()}`);

  }

}



export function perfMarkShellRendered(): void {

  perfMark('shell:rendered');

  perfMeasure('renderer-bootstrap-to-shell', 'app:init:start', 'shell:rendered');

  perfMeasure('shell-visible', 'app:init:start', 'shell:rendered');

  logPerfSinceOrigin('shellVisible');

}



export function perfMarkSnapshotLoaded(): void {

  perfMark('library:snapshot:loaded');

  perfMeasure('library-snapshot-load', 'app:init:start', 'library:snapshot:loaded');

  logPerfSinceOrigin('snapshotLoaded');

}



export function perfMarkCachedCountsVisible(): void {

  perfMark('library:counts:visible');

  logPerfSinceOrigin('cachedCountsVisible');

}



export function perfMarkFirstLibraryRows(): void {

  perfMark('library:firstRows:rendered');

  perfMeasure('library-first-rows', 'library:snapshot:loaded', 'library:firstRows:rendered');

  logPerfSinceOrigin('firstRowsVisible');

}



export function perfMarkUsableUI(): void {

  perfMark('library:usable');

  perfMeasure('library-usable', 'app:init:start', 'library:usable');

  logPerfSinceOrigin('usableUI');

}



export function perfMarkScanStart(): void {

  perfMark('library:scan:start');

}



export function perfMarkScanComplete(): void {

  perfMark('library:scan:done');

  perfMeasure('library-scan', 'library:scan:start', 'library:scan:done');

  logPerfSinceOrigin('scanComplete');

}



export function perfMarkSmartWarmStart(): void {

  perfMark('intelligence:warm:start');

}



export function perfMarkSmartWarmComplete(): void {

  perfMark('intelligence:warm:done');

  perfMeasure('intelligence-warm', 'intelligence:warm:start', 'intelligence:warm:done');

  logPerfSinceOrigin('smartWarm');

}



export function perfMarkThumbnailQueueStart(): void {

  perfMark('thumbnail:queue:start');

}



export function perfMarkFirstThumbnailReady(): void {

  perfMark('thumbnail:first:ready');

  perfMeasure('thumbnail-first', 'thumbnail:queue:start', 'thumbnail:first:ready');

  logPerfSinceOrigin('firstThumbnail');

}



function logPerfSinceOrigin(label: string): void {

  if (!isPerfEnabled()) return;

  const ms = perfElapsedMs();

  perfLog(`${label}=${ms.toFixed(1)}ms`);

}



export function measurePerf(label: string, startMark: string, endMark?: string): number | undefined {

  const ms = perfMeasure(label, startMark, endMark);

  if (ms != null && isPerfEnabled()) {

    const human = REPORT_LABELS[label] ?? label;

    perfLog(`${human}=${ms.toFixed(1)}ms`);

  }

  return ms;

}



export function perfMarkWatchEnterStart(): void {

  perfMark('watch:enter:start');

}



export function perfMarkWatchEnterDone(): void {

  perfMark('watch:enter:done');

  measurePerf('watch:enter', 'watch:enter:start', 'watch:enter:done');

  logPerfSinceOrigin('watchEnter');

}



export function perfMarkWatchExitStart(): void {

  perfMark('watch:exit:start');

}



export function perfMarkWatchExitDone(): void {

  perfMark('watch:exit:done');

  measurePerf('watch:exit', 'watch:exit:start', 'watch:exit:done');

}



export function perfMarkVideoSwitchStart(): void {

  perfMark('video:switch:start');

}



export function perfMarkVideoPlaybackIntent(): void {

  perfMark('video:switch:playbackIntent');

  measurePerf('video-switch-intent', 'video:switch:start', 'video:switch:playbackIntent');

  logPerfSinceOrigin('videoSwitchIntent');

}



export function perfMarkVideoSwitchDone(): void {

  perfMark('video:switch:done');

  measurePerf('video:switch', 'video:switch:start', 'video:switch:done');

  logPerfSinceOrigin('videoSwitch');

}



export function perfMarkVideoFirstFrame(): void {

  perfMark('video:first-frame');

  logPerfSinceOrigin('videoFirstFrame');

}



export function dumpPerfSummary(): void {

  if (!isPerfEnabled() || typeof performance === 'undefined') return;

  const measures = performance.getEntriesByType('measure');

  const relevant = measures.filter((m) =>

    m.name.startsWith('library')

    || m.name.startsWith('shell')

    || m.name.startsWith('watch')

    || m.name.startsWith('video')

    || m.name.startsWith('intelligence')

    || m.name.startsWith('thumbnail')

    || m.name.includes('bootstrap')

    || m.name.startsWith('mini-')

    || m.name.startsWith('theater-')

    || m.name.startsWith('player-')

  );

  if (relevant.length === 0) return;

  perfLog(`mode=${getPerfBuildMode()} —— summary ——`);

  const snapshot: Record<string, number> = {};
  for (const entry of relevant) {
    const human = REPORT_LABELS[entry.name] ?? entry.name;
    perfLog(`${human}=${entry.duration.toFixed(1)}ms`);
    snapshot[human] = Math.round(entry.duration * 10) / 10;
  }
  snapshot.shellVisibleMs = Math.round(perfElapsedMs() * 10) / 10;
  try {
    localStorage.setItem('virelia:last-perf-summary', JSON.stringify({
      mode: getPerfBuildMode(),
      at: new Date().toISOString(),
      measures: snapshot,
    }));
  } catch {
    // ignore
  }
  libraryPerfDump('startup');
  dumpDevRenderCounts();
}


