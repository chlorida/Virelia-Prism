import type { SubtitleTrack } from '../../../shared/subtitleTypes';

import { isNonSpeechCue } from './subtitleCueUtils';

import type { RepetitionStats } from './subtitleCueUtils';

import type { ParsedCue } from './vttParser';



export interface SubtitlePipelineDebug {

  currentVideoPath: string | null;

  currentVideoKey: string | null;

  selectedTrackVideoKey: string | null;

  allTrackVideoKeys: string[];

  externalTrackPaths: string[];

  generatedTrackPaths: string[];

  staleTrackIgnored: boolean;

  generatedTrackDebug: Array<{

    trackId: string;

    targetLanguage: string;

    generationValid?: boolean;

    generationInvalidReason?: string;

    path?: string;

    pipelineVersion?: number;

  }>;

  selectedTrackId: string | null;

  selectedTrackLabel: string | null;

  selectedTrackPath: string | null;

  selectedTrackFormat: string | null;

  selectedTrackSource: string | null;

  selectedTrackStatus: string | null;

  readSource: 'tauri' | 'fetch' | 'none';

  rawLength: number;

  rawSubtitleTextLength: number;

  rawPreview: string;

  convertedPreview: string;

  parsedCueCount: number;

  videoDuration: number | null;

  cueCount: number | null;

  speechCueCount: number | null;

  totalCueDuration: number | null;

  coverageRatio: number | null;

  lastCueEnd: number | null;

  longestGap: number | null;

  validationStatus: string | null;

  invalidReason: string | null;

  firstCues: Array<{ start: number; end: number; text: string }>;

  lastCues: Array<{ start: number; end: number; text: string }>;

  videoCurrentTime: number | null;

  activeCue: { start: number; end: number; text: string } | null;

  displayText: string;

  displayTextError: string | null;

  parseError: string | null;

  validationError: string | null;

  repetitionStats: RepetitionStats | null;

  applyError: string | null;

  fetchedContentType: string | null;

  looksLikeHtml: boolean;

}



const emptyDebug = (): SubtitlePipelineDebug => ({

  currentVideoPath: null,

  currentVideoKey: null,

  selectedTrackVideoKey: null,

  allTrackVideoKeys: [],

  externalTrackPaths: [],

  generatedTrackPaths: [],

  staleTrackIgnored: false,

  generatedTrackDebug: [],

  selectedTrackId: null,

  selectedTrackLabel: null,

  selectedTrackPath: null,

  selectedTrackFormat: null,

  selectedTrackSource: null,

  selectedTrackStatus: null,

  readSource: 'none',

  rawLength: 0,

  rawSubtitleTextLength: 0,

  rawPreview: '',

  convertedPreview: '',

  parsedCueCount: 0,

  videoDuration: null,

  cueCount: null,

  speechCueCount: null,

  totalCueDuration: null,

  coverageRatio: null,

  lastCueEnd: null,

  longestGap: null,

  validationStatus: null,

  invalidReason: null,

  firstCues: [],

  lastCues: [],

  videoCurrentTime: null,

  activeCue: null,

  displayText: '',

  displayTextError: null,

  parseError: null,

  validationError: null,

  repetitionStats: null,

  applyError: null,

  fetchedContentType: null,

  looksLikeHtml: false,

});



let lastDebug: SubtitlePipelineDebug = emptyDebug();



export function getSubtitleDebugSnapshot(): SubtitlePipelineDebug {

  return {

    ...lastDebug,

    firstCues: [...lastDebug.firstCues],

    lastCues: [...lastDebug.lastCues],

    allTrackVideoKeys: [...lastDebug.allTrackVideoKeys],

    externalTrackPaths: [...lastDebug.externalTrackPaths],

    generatedTrackPaths: [...lastDebug.generatedTrackPaths],

    generatedTrackDebug: [...lastDebug.generatedTrackDebug],

    repetitionStats: lastDebug.repetitionStats ? { ...lastDebug.repetitionStats } : null,

  };

}



export function updateSubtitleDebug(patch: Partial<SubtitlePipelineDebug>): void {

  lastDebug = { ...lastDebug, ...patch };

}



export function resetSubtitleDebug(): void {

  lastDebug = emptyDebug();

}



export function findActiveCue(

  cues: ParsedCue[],

  time: number,

  options?: { hideNonSpeech?: boolean }

): ParsedCue | null {

  if (cues.length === 0) return null;

  let lo = 0;

  let hi = cues.length - 1;

  let best = -1;

  while (lo <= hi) {

    const mid = (lo + hi) >> 1;

    if (cues[mid].start <= time) {

      best = mid;

      lo = mid + 1;

    } else {

      hi = mid - 1;

    }

  }

  if (best < 0) return null;

  for (let i = best; i >= 0; i -= 1) {

    const cue = cues[i];

    if (time < cue.start) continue;

    if (time >= cue.end) break;

    if (options?.hideNonSpeech && isNonSpeechCue(cue.text)) return null;

    return cue;

  }

  return null;

}



type PipelineDebugPatch = Partial<

  Omit<

    SubtitlePipelineDebug,

    'selectedTrackId' | 'selectedTrackLabel' | 'selectedTrackPath' | 'selectedTrackFormat'

  >

>;



export function logSubtitlePipeline(

  track: SubtitleTrack,

  debug: PipelineDebugPatch,

  cues: ParsedCue[]

): void {

  updateSubtitleDebug({

    ...debug,

    selectedTrackId: track.id,

    selectedTrackLabel: track.label,

    selectedTrackPath: track.path ?? null,

    selectedTrackFormat: track.format,

    selectedTrackSource: track.source,

    parsedCueCount: cues.length,

    firstCues: cues.slice(0, 5).map((c) => ({ start: c.start, end: c.end, text: c.text })),

    lastCues: cues.slice(-5).map((c) => ({ start: c.start, end: c.end, text: c.text })),

  });



  const snapshot = getSubtitleDebugSnapshot();

  console.group('[Virelia subtitles] pipeline');

  console.log('selectedTrackId:', snapshot.selectedTrackId);

  console.log('selectedTrack.source:', snapshot.selectedTrackSource);

  console.log('selectedTrack.label:', snapshot.selectedTrackLabel);

  console.log('selectedTrack.path:', snapshot.selectedTrackPath);

  console.log('readSource:', snapshot.readSource);

  console.log('rawLength:', snapshot.rawLength);

  console.log('parsedCueCount:', snapshot.parsedCueCount);

  console.log('first5 cues:', snapshot.firstCues);

  console.log('last5 cues:', snapshot.lastCues);

  console.log('videoCurrentTime:', snapshot.videoCurrentTime);

  console.log('activeCue:', snapshot.activeCue);

  console.log('displayText:', snapshot.displayText);

  if (snapshot.parseError) console.warn('parseError:', snapshot.parseError);

  if (snapshot.validationError) console.warn('validationError:', snapshot.validationError);

  if (snapshot.repetitionStats) console.log('repetitionStats:', snapshot.repetitionStats);

  if (snapshot.videoDuration != null) console.log('videoDuration:', snapshot.videoDuration);

  if (snapshot.cueCount != null) console.log('cueCount:', snapshot.cueCount);

  if (snapshot.speechCueCount != null) console.log('speechCueCount:', snapshot.speechCueCount);

  if (snapshot.totalCueDuration != null) console.log('totalCueDuration:', snapshot.totalCueDuration);

  if (snapshot.coverageRatio != null) console.log('coverageRatio:', snapshot.coverageRatio);

  if (snapshot.lastCueEnd != null) console.log('lastCueEnd:', snapshot.lastCueEnd);

  if (snapshot.longestGap != null) console.log('longestGap:', snapshot.longestGap);

  if (snapshot.validationStatus) console.log('validationStatus:', snapshot.validationStatus);

  if (snapshot.invalidReason) console.warn('invalidReason:', snapshot.invalidReason);

  if (snapshot.applyError) console.warn('applyError:', snapshot.applyError);

  if (snapshot.displayTextError) console.error('displayTextError:', snapshot.displayTextError);

  if (snapshot.looksLikeHtml) console.warn('subtitle fetch returned HTML, not subtitle text');

  console.groupEnd();

}



export function previewText(text: string, max = 500): string {

  return text.slice(0, max);

}



export function looksLikeHtmlPayload(text: string): boolean {

  const head = text.trimStart().slice(0, 200).toLowerCase();

  return head.startsWith('<!doctype') || head.startsWith('<html') || head.includes('<head>');

}


