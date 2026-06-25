import { memo } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useResolvedMediaTitle } from '../../hooks/useResolvedMediaTitle';
import { usePlayback } from '../../playback/usePlayback';
import { useManagedPreviewHost } from '../../playback/useManagedPreviewHost';
import { isActivelyPlaying } from '../../playback/playbackTypes';
import { MiniProgressBar } from './MiniProgressBar';
import { MiniVolumeControl } from './MiniVolumeControl';

interface VideoMiniViewProps {
  durationSeconds: number;
  onPrevious: () => void;
  onNext: () => void;
}

export const VideoMiniView = memo(function VideoMiniView(props: VideoMiniViewProps) {
  const { t } = useI18n();
  const { state, actions } = usePlayback();
  const attachHost = useManagedPreviewHost('mini', true);
  const playing = isActivelyPlaying(state.playbackStatus);
  const maxDuration = Math.max(props.durationSeconds, state.duration, 0);
  const track = state.currentTrack;
  const displayTitle = useResolvedMediaTitle(track);

  if (!state.isVideo || !track) return null;

  return (
    <section className="mini-player mini-player--video" aria-label={t('player.mini')}>
      <div ref={attachHost} className="mini-player__video" />
      <div className="mini-player__footer">
        <strong className="mini-title" title={displayTitle}>{displayTitle}</strong>
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
      </div>
    </section>
  );
});
