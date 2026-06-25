import { memo, useEffect, useMemo, useState } from 'react';
import type { PlaybackState } from '../../../shared/types';
import { isActivelyPlaying } from '../../playback/playbackTypes';
import { usePlayback, usePlaybackSelector } from '../../playback/usePlayback';
import { PlaybackBar } from '../PlaybackBar';

import type { PlayerMode } from '../../features/ui/playerModeTypes';

interface BottomPlayerProps {
  playerMode?: PlayerMode;
  durationSeconds: number;
  videoTheater?: boolean;
  onVideoTheater?: () => void;
  onOpenPlayer?: () => void;
  onBackToLibrary?: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRepeatChange: (repeat: PlaybackState['repeat']) => void;
  onShuffleChange: (shuffle: boolean) => void;
  onMiniPlayer: () => void;
  onVolumePersist: (volume: number) => void;
  onSpeedPersist: (speed: number) => void;
}

export const BottomPlayer = memo(function BottomPlayer(props: BottomPlayerProps) {
  const { actions } = usePlayback();
  const track = usePlaybackSelector((s) => s.currentTrack);
  const playbackStatus = usePlaybackSelector((s) => s.playbackStatus);
  const progress = usePlaybackSelector((s) => ({
    currentTime: s.currentTime,
    duration: s.duration,
    bufferedEnd: s.bufferedEnd,
    volume: s.volume,
    playbackRate: s.playbackRate,
    repeat: s.repeat,
    shuffle: s.shuffle,
    engineStatus: s.engineStatus,
    error: s.error,
    isVideo: s.isVideo,
  }));

  const playbackForBar = useMemo<PlaybackState>(() => ({
    playing: isActivelyPlaying(playbackStatus),
    positionSeconds: progress.currentTime,
    volume: progress.volume,
    speed: progress.playbackRate,
    repeat: progress.repeat,
    shuffle: progress.shuffle,
    currentMediaId: track?.id,
    engineStatus: progress.engineStatus,
  }), [playbackStatus, progress, track?.id]);

  const isPlaying = isActivelyPlaying(playbackStatus);
  const isLoading = playbackStatus === 'loading';
  const effectiveDuration = Math.max(props.durationSeconds, progress.duration);
  const [shortViewport, setShortViewport] = useState(
    () => typeof window !== 'undefined' && window.innerHeight < 860
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-height: 860px)');
    const onChange = () => setShortViewport(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const compactBar = props.playerMode === 'player' || progress.isVideo || shortViewport;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const notify = () => window.dispatchEvent(new CustomEvent('prism:shell-restored'));
    notify();
    const id = window.setTimeout(notify, 80);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <PlaybackBar
      media={track ?? undefined}
      playback={playbackForBar}
      durationSeconds={effectiveDuration}
      liveDurationSeconds={progress.duration}
      bufferedEnd={progress.bufferedEnd}
      isPlaying={isPlaying}
      isLoading={isLoading}
      playError={progress.error ?? undefined}
      playerMode={props.playerMode}
      compact={compactBar}
      isVideo={progress.isVideo}
      videoTheater={props.videoTheater}
      onVideoTheater={props.onVideoTheater}
      onToggle={() => actions.togglePlay()}
      onPrevious={props.onPrevious}
      onNext={props.onNext}
      onSeek={(position) => { void actions.seek(position); }}
      onVolume={(volume) => {
        actions.setVolume(volume);
        props.onVolumePersist(volume);
      }}
      onSpeed={(speed) => {
        actions.setPlaybackRate(speed);
        props.onSpeedPersist(speed);
      }}
      onRepeatChange={props.onRepeatChange}
      onShuffleChange={props.onShuffleChange}
      onOpenPlayer={props.onOpenPlayer}
      onBackToLibrary={props.onBackToLibrary}
      onMiniPlayer={props.onMiniPlayer}
    />
  );
});
