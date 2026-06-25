import { memo } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { usePlayback } from '../../playback/usePlayback';
import { isActivelyPlaying } from '../../playback/playbackTypes';
import { MiniProgressBar } from './MiniProgressBar';
import { MiniVolumeControl } from './MiniVolumeControl';

interface AudioMiniViewProps {
  durationSeconds: number;
  onPrevious: () => void;
  onNext: () => void;
}

function coverInitial(title?: string): string {
  const trimmed = title?.trim();
  if (!trimmed) return '♪';
  return trimmed.charAt(0).toUpperCase();
}

export const AudioMiniView = memo(function AudioMiniView(props: AudioMiniViewProps) {
  const { t } = useI18n();
  const { state, actions } = usePlayback();
  const track = state.currentTrack;
  const playing = isActivelyPlaying(state.playbackStatus);
  const maxDuration = Math.max(props.durationSeconds, state.duration, 0);

  return (
    <section className="mini-player mini-player--audio" aria-label={t('player.mini')}>
      <div className="mini-player__main">
        <div className="mini-artwork" aria-hidden>
          <span className="mini-artwork__letter">{coverInitial(track?.title)}</span>
        </div>
        <div className="mini-player__meta">
          <strong className="mini-title" title={track?.title}>
            {track?.title ?? t('player.nothingPlaying')}
          </strong>
          <small className="mini-subtitle" title={track?.fileName}>
            {track?.artist ?? track?.fileName ?? ''}
          </small>
        </div>
      </div>
      <div className="mini-player__controls-row">
        <div className="mini-controls" role="group" aria-label={t('player.transport')}>
          <button type="button" className="mini-controls__btn" onClick={props.onPrevious}>
            {t('player.prev')}
          </button>
          <button type="button" className="mini-controls__play" onClick={() => actions.togglePlay()}>
            {playing ? t('player.pause') : t('player.play')}
          </button>
          <button type="button" className="mini-controls__btn" onClick={props.onNext}>
            {t('player.next')}
          </button>
        </div>
        <MiniVolumeControl />
      </div>
      <MiniProgressBar
        currentTime={state.currentTime}
        duration={maxDuration}
        onSeek={(seconds) => { void actions.seek(seconds); }}
      />
    </section>
  );
});
