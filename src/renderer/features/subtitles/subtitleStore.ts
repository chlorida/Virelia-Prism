import type {
  ExternalSubtitleScanStatus,
  GenerationAvailabilityReason,
  SourceAudioLanguage,
  SubtitleCoverageRange,
  SubtitleGenerationProgressDetail,
  SubtitleGenerationStatus,
  SubtitlePreferredLanguage,
  SubtitleState,
  SubtitleTrack,
  TargetSubtitleLanguage,
} from '../../../shared/subtitleTypes';

export type SubtitleStoreListener = (state: SubtitleState) => void;

const initialState = (): SubtitleState => ({
  videoId: null,
  videoPath: null,
  videoKey: null,
  availableTracks: [],
  selectedTrackId: null,
  preferredLanguage: 'auto',
  targetSubtitleLanguage: 'en',
  sourceAudioLanguage: 'auto',
  markForeignSpeech: true,
  showSoundLabels: false,
  nameStyle: 'localized_ru',
  externalScanStatus: 'idle',
  generationAvailability: 'unavailable_no_ffmpeg',
  generationStatus: 'idle',
  generationDiagnostics: null,
  generationDetail: null,
  coverageRanges: [],
  selectedAudioStreamIndex: null,
  availableAudioStreams: [],
  playbackError: undefined,
  playbackErrorKind: undefined,
  playbackErrorDetails: undefined,
  playbackErrorTrackId: null,
  selectionWarning: undefined,
  userDisabledLiveSubtitles: false,
  translationAvailable: false,
  loading: false,
});

export class SubtitleStore {
  private state: SubtitleState = initialState();
  private listeners = new Set<SubtitleStoreListener>();

  getState(): SubtitleState {
    return this.state;
  }

  subscribe(listener: SubtitleStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  patch(partial: Partial<SubtitleState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  reset(): void {
    this.state = initialState();
    this.emit();
  }

  setTracks(tracks: SubtitleTrack[], videoKey?: string | null): void {
    const key = videoKey ?? this.state.videoKey;
    const scoped = key ? tracks.filter((tr) => tr.videoKey === key) : tracks;
    this.patch({ availableTracks: scoped, loading: false });
  }

  patchTrackRuntime(
    trackId: string,
    runtime: Partial<Pick<SubtitleTrack, 'status' | 'error' | 'invalidReason'>>
  ): void {
    const availableTracks = this.state.availableTracks.map((track) =>
      track.id === trackId ? { ...track, ...runtime } : track
    );
    this.patch({ availableTracks });
  }

  beginVideoLoad(videoId: string, videoPath: string, videoKey: string): void {
    this.patch({
      videoId,
      videoPath,
      videoKey,
      availableTracks: [],
      selectedTrackId: null,
      loading: true,
      externalScanStatus: 'scanning',
      generationStatus: 'idle',
      generationError: undefined,
      generationErrorDetails: undefined,
      generationDiagnostics: null,
      generationDetail: null,
      coverageRanges: [],
      selectedAudioStreamIndex: null,
      availableAudioStreams: [],
      playbackError: undefined,
      playbackErrorKind: undefined,
      playbackErrorDetails: undefined,
      playbackErrorTrackId: null,
      selectionWarning: undefined,
      userDisabledLiveSubtitles: false,
    });
  }

  setPreferredLanguage(language: SubtitlePreferredLanguage): void {
    this.patch({ preferredLanguage: language });
  }

  setTargetSubtitleLanguage(language: TargetSubtitleLanguage): void {
    this.patch({ targetSubtitleLanguage: language });
  }

  setSourceAudioLanguage(language: SourceAudioLanguage): void {
    this.patch({ sourceAudioLanguage: language });
  }

  setMarkForeignSpeech(enabled: boolean): void {
    this.patch({ markForeignSpeech: enabled });
  }

  setShowSoundLabels(enabled: boolean): void {
    this.patch({ showSoundLabels: enabled });
  }

  setNameStyle(style: 'romanized' | 'localized_ru'): void {
    this.patch({ nameStyle: style });
  }

  setExternalScanStatus(status: ExternalSubtitleScanStatus): void {
    this.patch({ externalScanStatus: status });
  }

  setGenerationAvailability(reason: GenerationAvailabilityReason): void {
    this.patch({ generationAvailability: reason });
  }

  setGeneration(
    status: SubtitleGenerationStatus,
    progress?: number,
    error?: string,
    message?: string,
    errorDetails?: string,
    diagnostics?: import('../../../shared/subtitleTypes').SubtitleGenerationDiagnostics | null,
    detail?: SubtitleGenerationProgressDetail | null,
    coverageRanges?: SubtitleCoverageRange[]
  ): void {
    this.patch({
      generationStatus: status,
      generationProgress: progress,
      generationMessage: message,
      generationError: error,
      generationErrorDetails: errorDetails,
      generationDiagnostics: diagnostics ?? (status === 'failed' ? this.state.generationDiagnostics : null),
      generationDetail: detail ?? (status === 'idle' || status === 'completed' ? null : this.state.generationDetail),
      coverageRanges: coverageRanges ?? this.state.coverageRanges,
    });
  }

  upsertPartialTrack(track: SubtitleTrack): void {
    const others = this.state.availableTracks.filter((tr) => tr.id !== track.id);
    this.patch({ availableTracks: [...others, track] });
  }

  setCoverageRanges(ranges: SubtitleCoverageRange[]): void {
    this.patch({ coverageRanges: ranges });
  }

  setAudioStreams(
    streams: import('../../../shared/subtitleTypes').VideoAudioStream[],
    selectedIndex?: number | null
  ): void {
    this.patch({
      availableAudioStreams: streams,
      selectedAudioStreamIndex: selectedIndex ?? this.state.selectedAudioStreamIndex ?? null,
    });
  }

  setSelectedAudioStreamIndex(index: number | null): void {
    this.patch({ selectedAudioStreamIndex: index });
  }

  private emit(): void {
    const snapshot = this.state;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export function createSubtitleStore(): SubtitleStore {
  return new SubtitleStore();
}
