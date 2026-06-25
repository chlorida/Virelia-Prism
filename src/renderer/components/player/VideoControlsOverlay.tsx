import { memo, type RefObject } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatDuration } from '../../lib/search';
import { usePlaybackActions, usePlaybackSelector } from '../../playback/usePlayback';
import { useOptionalAppShell } from '../../app/AppShellContext';
import { ProgressBar } from './ProgressBar';
import { IconButton } from './IconButton';
import { PlayerSpeedButton } from './PlayerSpeedButton';
import { PrismRange } from './PrismRange';
import type { useVideoPlayerChrome } from './useVideoPlayerChrome';
import { useVideoSubtitlesContext } from '../../features/subtitles/VideoSubtitlesContext';
import { VideoSubtitleMenu } from './VideoSubtitleMenu';
import { CharacterIdentifyControl } from './CharacterIdentifyControl';
import { PlayerPopoverProvider, useOptionalPlayerPopover } from './playerPopoverContext';
import {
  IconMaximize,
  IconMinimize,
  IconPause,
  IconPlay,
  IconTheater,
  IconTheaterExit,
  IconVolume,
  IconVolumeMuted,
} from './PlayerIcons';

interface VideoControlsOverlayProps {
  surfaceRef: RefObject<HTMLElement | null>;
  layout?: 'library' | 'watch';
  chrome: ReturnType<typeof useVideoPlayerChrome>;
}

const VideoPlayerProgress = memo(function VideoPlayerProgress(props: {
  currentTime: number;
  duration: number;
  bufferedEnd?: number;
  disabled?: boolean;
  onSeek: (value: number) => void;
}) {
  const subtitles = useVideoSubtitlesContext();
  const popover = useOptionalPlayerPopover();
  const menuOpen = popover?.isOpen('subtitles') ?? false;
  const coverageRanges = subtitles.getVisibleCoverageRanges(menuOpen);

  return (
    <ProgressBar
      className="video-controls__progress"
      showTimes={false}
      currentTime={props.currentTime}
      duration={props.duration}
      bufferedEnd={props.bufferedEnd}
      coverageRanges={coverageRanges}
      disabled={props.disabled}
      onSeek={props.onSeek}
    />
  );
});

const VideoSubtitleMenuSlot = memo(function VideoSubtitleMenuSlot(props: { disabled?: boolean }) {
  const subtitles = useVideoSubtitlesContext();
  return <VideoSubtitleMenu disabled={props.disabled} subtitles={subtitles} />;
});

const VideoControlsButtonRow = memo(function VideoControlsButtonRow(props: {
  surfaceRef: RefObject<HTMLElement | null>;
  layout?: 'library' | 'watch';
  playing: boolean;
  loading: boolean;
  showControls: boolean;
  isFullscreen: boolean;
  speedMenuOpen: boolean;
  setSpeedMenuOpen: (open: boolean) => void;
  onControlsPointerEnter: () => void;
  onControlsPointerLeave: () => void;
}) {
  const { t } = useI18n();
  const shell = useOptionalAppShell();
  const { actions } = usePlaybackActions();
  const currentTrack = usePlaybackSelector((s) => s.currentTrack);
  const currentTime = usePlaybackSelector((s) => s.currentTime);
  const duration = usePlaybackSelector((s) => s.duration);
  const muted = usePlaybackSelector((s) => s.muted);
  const volume = usePlaybackSelector((s) => s.volume);
  const playbackRate = usePlaybackSelector((s) => s.playbackRate);

  const watchLayout = props.layout === 'watch';
  const maxDuration = Math.max(duration, currentTime, 0);
  const fsLabel = props.isFullscreen ? t('player.exitFullscreen') : t('player.enterFullscreen');
  const theaterOn = shell?.videoTheaterOpen ?? false;

  return (
    <div
      className="video-controls__bottom"
      data-video-control
      onPointerEnter={props.onControlsPointerEnter}
      onPointerLeave={props.onControlsPointerLeave}
    >
      <VideoPlayerProgress
        currentTime={currentTime}
        duration={duration}
        disabled={!currentTrack?.filePath}
        onSeek={(value) => { void actions.seek(value); }}
      />
      <div className="video-controls__row">
        <div className="video-controls__left">
          <IconButton
            label={props.playing ? t('player.pause') : t('player.play')}
            onClick={(e) => { e.stopPropagation(); actions.togglePlay(); }}
          >
            {props.loading ? <span className="vc-icon-btn__dots">…</span> : props.playing ? <IconPause /> : <IconPlay />}
          </IconButton>
          <span className="video-controls__times">
            <span>{formatDuration(currentTime)}</span>
            <span className="video-controls__times-sep">/</span>
            <span>{formatDuration(maxDuration)}</span>
          </span>
          <IconButton
            label={muted ? t('player.unmute') : t('player.mute')}
            onClick={(e) => { e.stopPropagation(); actions.setMuted(!muted); }}
          >
            {muted ? <IconVolumeMuted /> : <IconVolume />}
          </IconButton>
          <div className="video-controls__volume-wrap" data-video-control>
            <PrismRange
              variant="volume"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              aria-label={t('player.volume')}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => actions.setVolume(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="video-controls__right">
          <PlayerSpeedButton
            value={playbackRate}
            disabled={!currentTrack?.filePath}
            onOpenChange={props.setSpeedMenuOpen}
            onChange={(speed) => actions.setPlaybackRate(speed)}
          />
          <VideoSubtitleMenuSlot
            disabled={!currentTrack?.filePath || currentTrack?.kind !== 'video'}
          />
          <CharacterIdentifyControl />
          {watchLayout && shell && (
            <IconButton
              label={theaterOn ? t('player.exitTheater') : t('player.theater')}
              active={theaterOn}
              onClick={(e) => {
                e.stopPropagation();
                shell.modeTransitions.onVideoTheater();
              }}
            >
              {theaterOn ? <IconTheaterExit /> : <IconTheater />}
            </IconButton>
          )}
          <IconButton
            label={fsLabel}
            onClick={(e) => {
              e.stopPropagation();
              actions.enterFullscreen(props.surfaceRef.current ?? undefined);
            }}
          >
            {props.isFullscreen ? <IconMinimize /> : <IconMaximize />}
          </IconButton>
        </div>
      </div>
    </div>
  );
});

export function VideoControlsOverlay(props: VideoControlsOverlayProps) {
  const { t } = useI18n();
  const { actions } = usePlaybackActions();
  const isPreviewVisible = usePlaybackSelector((s) => s.isPreviewVisible);
  const playbackStatus = usePlaybackSelector((s) => s.playbackStatus);
  const {
    playing,
    loading,
    paused,
    showControls,
    isFullscreen,
    speedMenuOpen,
    setSpeedMenuOpen,
    handleControlsPointerEnter,
    handleControlsPointerLeave,
  } = props.chrome;

  if (!isPreviewVisible) return null;

  const showCenterPlay = showControls && (!playing || paused || loading);

  return (
    <PlayerPopoverProvider onActiveChange={(active) => setSpeedMenuOpen(active !== null)}>
      <div
        className={`video-controls video-controls--cinema ${showControls ? 'video-controls--visible' : ''}`}
        onPointerEnter={handleControlsPointerEnter}
        onPointerLeave={handleControlsPointerLeave}
      >
        {loading && <div className="video-controls__spinner" aria-hidden />}

        {showCenterPlay && (
          <div className="video-controls__center">
            <button
              type="button"
              className="video-controls__play video-controls__play--large"
              data-video-control
              aria-label={playing ? t('player.pause') : t('player.play')}
              onClick={(event) => {
                event.stopPropagation();
                actions.togglePlay();
              }}
            >
              {loading ? (
                <span className="video-controls__center-loading" aria-hidden />
              ) : playing ? (
                <IconPause width={32} height={32} />
              ) : (
                <IconPlay width={32} height={32} />
              )}
            </button>
          </div>
        )}

        <VideoControlsButtonRow
          surfaceRef={props.surfaceRef}
          layout={props.layout}
          playing={playing}
          loading={loading}
          showControls={showControls}
          isFullscreen={isFullscreen}
          speedMenuOpen={speedMenuOpen}
          setSpeedMenuOpen={setSpeedMenuOpen}
          onControlsPointerEnter={handleControlsPointerEnter}
          onControlsPointerLeave={handleControlsPointerLeave}
        />
      </div>
    </PlayerPopoverProvider>
  );
}
