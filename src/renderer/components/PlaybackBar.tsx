import type { MediaItem, PlaybackState, RepeatMode } from '../../shared/types';
import type { PlayerMode } from '../features/ui/playerModeTypes';
import { formatDuration } from '../lib/search';
import { useI18n } from '../i18n/I18nProvider';
import { useResolvedMediaTitle } from '../hooks/useResolvedMediaTitle';
import { formatFolderLabelForDisplay } from '../lib/pathDisplay';
import { SpeedMenu } from './player/SpeedMenu';
import { PrismRange } from './player/PrismRange';
import { resolveBottomVideoOpenLabel } from '../lib/videoPrimaryAction';
import { MediaThumb } from './watch/MediaThumb';
import { useScrubRange } from './player/useScrubRange';
import {
  IconPause,
  IconPlay,
  IconRepeat,
  IconRepeatOne,
  IconShuffle,
  IconSkipBack,
  IconSkipForward,
} from './player/PlayerIcons';

interface PlaybackBarProps {
  media?: MediaItem;
  playback: PlaybackState;
  durationSeconds: number;
  liveDurationSeconds: number;
  bufferedEnd: number;
  isPlaying: boolean;
  isLoading?: boolean;
  playError?: string;
  playerMode?: PlayerMode;
  onOpenPlayer?: () => void;
  onBackToLibrary?: () => void;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (positionSeconds: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  onVolume: (volume: number) => void;
  onSpeed: (speed: number) => void;
  onRepeatChange: (repeat: RepeatMode) => void;
  onShuffleChange: (shuffle: boolean) => void;
  onMiniPlayer: () => void;
  compact?: boolean;
  isVideo?: boolean;
  videoTheater?: boolean;
  onVideoTheater?: () => void;
}

const repeatCycle: RepeatMode[] = ['off', 'all', 'one'];

function coverInitial(title?: string): string {
  const trimmed = title?.trim();
  if (!trimmed) return '♪';
  return trimmed.charAt(0).toUpperCase();
}

export function PlaybackBar(props: PlaybackBarProps) {
  const { t } = useI18n();
  const displayTitle = useResolvedMediaTitle(props.media);
  const hasTrack = Boolean(props.media?.filePath);
  const isLoading = Boolean(props.isLoading && hasTrack);
  const effectiveDuration = Math.max(props.durationSeconds, props.liveDurationSeconds, 0);
  const maxDuration = effectiveDuration > 0 ? effectiveDuration : Math.max(props.playback.positionSeconds, 0);
  const { displayTime, bind: seekBind, railBind: seekRailBind } = useScrubRange({
    currentTime: props.playback.positionSeconds,
    duration: maxDuration,
    onSeek: props.onSeek,
    onSeekStart: props.onSeekStart,
    onSeekEnd: props.onSeekEnd,
  });
  const bufferPercent = maxDuration > 0 ? Math.min(100, (props.bufferedEnd / maxDuration) * 100) : 0;

  const kindBadge = props.media?.kind === 'video' ? t('media.kind.video') : t('media.kind.audio');
  const folderLine = props.media
    ? (props.media.folderLabel ?? formatFolderLabelForDisplay(props.media.folder))
    : '';
  const subtitle = props.playError
    ?? (hasTrack
      ? [props.media?.artist, folderLine, kindBadge].filter(Boolean).join(' · ')
      : t('player.selectTrack'));

  const engineLabel = props.playback.engineStatus.engine === 'mpv'
    ? t('player.engine.mpv')
    : t('player.engine.html5');
  const engineTitle = props.playback.engineStatus.message
    + (props.playback.engineStatus.executablePath ? `\n${props.playback.engineStatus.executablePath}` : '');

  function cycleRepeat() {
    const index = repeatCycle.indexOf(props.playback.repeat);
    const next = repeatCycle[(index + 1) % repeatCycle.length];
    props.onRepeatChange(next);
  }

  const barClass = [
    'playback-bar',
    hasTrack ? 'playback-bar--enter' : '',
    props.playerMode === 'mini' ? 'playback-bar--mini' : '',
    props.compact ? 'playback-bar--compact' : '',
    props.playerMode === 'library' ? 'playback-bar--library' : '',
    props.playerMode === 'player' ? 'playback-bar--player-mode' : ''
  ].filter(Boolean).join(' ');

  const showVisualizer = !props.compact && props.playerMode !== 'mini' && !props.isVideo;
  const showSecondaryToggles = props.playerMode !== 'player' && !props.isVideo;
  const isVideoWatch = props.isVideo && props.playerMode === 'player';
  const openPlayerLabelKey = props.isVideo && props.media
    ? resolveBottomVideoOpenLabel({
        isCurrent: true,
        inWatchMode: props.playerMode === 'player',
        resumeSeconds: props.media.resumePositionSeconds,
      })
    : 'player.openPlayer';

  return (
    <footer className={barClass}>
      <div className="playback-bar__main-row">
        <div className="playback-bar__left now-playing-mini">
          {props.media?.kind === 'video' && props.media.filePath ? (
            <MediaThumb item={props.media} size="player" priority="critical" lazy={false} />
          ) : (
            <div className="cover-glow cover-glow--art" aria-hidden>
              <span className="cover-glow__letter">{coverInitial(displayTitle)}</span>
            </div>
          )}
          <div key={props.media?.id ?? 'idle'} className="now-playing-copy playback-bar__track-info--crossfade">
            <strong title={displayTitle}>{displayTitle || t('player.nothingPlaying')}</strong>
            <small className={props.playError ? 'play-error' : undefined} title={subtitle}>{subtitle}</small>
            {hasTrack && !props.playError && (
              <span className="now-playing-kind-badge">{kindBadge}</span>
            )}
          </div>
          {props.playerMode !== 'mini' && (
            <span className="engine-badge" title={engineTitle}>{engineLabel}</span>
          )}
        </div>

        <div className="playback-bar__center transport" role="group" aria-label={t('player.transport')}>
          {showSecondaryToggles && (
            <button
              type="button"
              className={[
                'transport-btn',
                'transport-btn--side-left',
                props.playback.shuffle ? 'transport-toggle is-active' : 'transport-toggle',
              ].filter(Boolean).join(' ')}
              disabled={!hasTrack}
              aria-label={t('player.shuffle')}
              aria-pressed={props.playback.shuffle}
              onClick={() => props.onShuffleChange(!props.playback.shuffle)}
              title={t('player.shuffle')}
            >
              <IconShuffle />
            </button>
          )}
          <button
            type="button"
            className="transport-btn transport-btn--side-left"
            disabled={!hasTrack}
            aria-label={t('player.prev')}
            onClick={props.onPrevious}
            title={t('player.prev')}
          >
            <IconSkipBack />
          </button>
          <button
            type="button"
            className={props.isPlaying ? 'transport-btn transport-btn--play play-button' : 'transport-btn transport-btn--play play-button is-idle'}
            disabled={!hasTrack || isLoading}
            aria-label={isLoading ? t('player.loading') : (props.isPlaying ? t('player.pause') : t('player.play'))}
            onClick={props.onToggle}
            title={isLoading ? t('player.loading') : (props.isPlaying ? t('player.pause') : t('player.play'))}
          >
            {isLoading ? <span className="transport-btn__loading">…</span> : (props.isPlaying ? <IconPause /> : <IconPlay />)}
          </button>
          <button
            type="button"
            className="transport-btn transport-btn--side-right"
            disabled={!hasTrack}
            aria-label={t('player.next')}
            onClick={props.onNext}
            title={t('player.next')}
          >
            <IconSkipForward />
          </button>
          {showSecondaryToggles && (
            <button
              type="button"
              className={[
                'transport-btn',
                'transport-btn--side-right',
                props.playback.repeat !== 'off' ? 'transport-toggle is-active' : 'transport-toggle',
              ].filter(Boolean).join(' ')}
              disabled={!hasTrack}
              aria-label={t('player.repeatTooltip', { mode: props.playback.repeat })}
              aria-pressed={props.playback.repeat !== 'off'}
              onClick={cycleRepeat}
              title={t('player.repeatTooltip', { mode: props.playback.repeat })}
            >
              {props.playback.repeat === 'one' ? <IconRepeatOne /> : <IconRepeat />}
            </button>
          )}
        </div>

        <div className="playback-bar__right">
          {showVisualizer && (
            <div className={`waveform ${props.isPlaying && !isLoading ? '' : 'waveform--idle'}`} aria-hidden>
              {Array.from({ length: 12 }, (_, index) => (
                <span key={index} style={{ height: `${12 + (index % 5) * 6}px` }} />
              ))}
            </div>
          )}

          <div className="playback-meta">
            <div className="playback-meta__volume">
              <PrismRange
                variant="volume"
                min={0}
                max={1}
                step={0.01}
                value={props.playback.volume}
                disabled={!hasTrack}
                aria-label={t('player.volume')}
                onChange={(event) => props.onVolume(Number(event.target.value))}
              />
            </div>
            <SpeedMenu
              value={props.playback.speed}
              disabled={!hasTrack}
              onChange={props.onSpeed}
            />
            {props.playerMode === 'library' && hasTrack && props.isVideo && props.onOpenPlayer && (
              <button
                type="button"
                className="ghost-button playback-bar__open-player"
                disabled={!hasTrack}
                aria-label={t(openPlayerLabelKey)}
                onClick={props.onOpenPlayer}
              >
                {t(openPlayerLabelKey)}
              </button>
            )}
            {isVideoWatch && props.onBackToLibrary && (
              <button type="button" className="ghost-button" onClick={props.onBackToLibrary}>
                {t('player.backToLibrary')}
              </button>
            )}
            {props.isVideo && props.onVideoTheater && (props.playerMode === 'player' || props.playerMode === 'library') && (
              <button
                type="button"
                className={props.videoTheater ? 'ghost-button is-active' : 'ghost-button'}
                disabled={!hasTrack}
                aria-label={props.videoTheater ? t('player.exitTheater') : t('player.theater')}
                onClick={props.onVideoTheater}
                title={props.videoTheater ? t('player.exitTheater') : t('player.theater')}
              >
                {props.videoTheater ? t('player.exitTheater') : t('player.theater')}
              </button>
            )}
            {props.playerMode !== 'mini' && (
              <button
                type="button"
                className="ghost-button"
                aria-label={t('player.mini')}
                onClick={props.onMiniPlayer}
                title={t('player.mini')}
              >
                {t('player.mini')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="playback-bar__seek-row playback-progress">
        <span aria-hidden>{formatDuration(displayTime)}</span>
        <PrismRange
          variant="seek"
          className="playback-bar__seek"
          railClassName="seek-rail"
          disabled={!hasTrack}
          bufferedPercent={bufferPercent}
          previewFormatter={formatDuration}
          railBind={seekRailBind}
          aria-label={t('player.seek')}
          aria-valuemin={0}
          aria-valuemax={maxDuration}
          aria-valuenow={seekBind.value}
          {...seekBind}
        />
        <span aria-hidden>{formatDuration(maxDuration)}</span>
      </div>
    </footer>
  );
}
