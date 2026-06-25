import { memo } from 'react';
import { parseDisplayTitleFromItem } from '../../lib/displayTitle';
import { useMediaDisplayLanguage } from '../../hooks/useMediaDisplayLanguage';
import { useI18n } from '../../i18n/I18nProvider';
import { formatDuration } from '../../lib/search';
import { isActivelyPlaying } from '../../playback/playbackTypes';
import { usePlayback } from '../../playback/usePlayback';

interface CompactWatchBarProps {
  onPrevious: () => void;
  onNext: () => void;
  onMini: () => void;
}

export const CompactWatchBar = memo(function CompactWatchBar(props: CompactWatchBarProps) {
  const { t } = useI18n();
  const mediaLang = useMediaDisplayLanguage();
  const { state, actions } = usePlayback();
  const track = state.currentTrack;
  const playing = isActivelyPlaying(state.playbackStatus);
  const max = Math.max(state.duration, state.currentTime, 0);
  const progress = max > 0 ? (state.currentTime / max) * 100 : 0;
  const parsed = track ? parseDisplayTitleFromItem(track, mediaLang) : null;
  const shortTitle = parsed?.shortTitle ?? t('player.nothingPlaying');
  const fullTitle = parsed?.title ?? shortTitle;

  return (
    <footer className="compact-watch-bar">
      <div className="compact-watch-bar__thumb" aria-hidden>
        {track?.kind === 'video' ? '▶' : '♪'}
      </div>
      <div className="compact-watch-bar__copy">
        <strong title={fullTitle}>{shortTitle}</strong>
        <div className="compact-watch-bar__progress" aria-hidden>
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="compact-watch-bar__transport">
        <button type="button" className="compact-watch-bar__icon" aria-label={t('player.prev')} onClick={props.onPrevious}>‹</button>
        <button
          type="button"
          className="compact-watch-bar__play"
          aria-label={playing ? t('player.pause') : t('player.play')}
          onClick={() => actions.togglePlay()}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" className="compact-watch-bar__icon" aria-label={t('player.next')} onClick={props.onNext}>›</button>
      </div>
      <span className="compact-watch-bar__time" aria-hidden>
        {formatDuration(state.currentTime)} / {formatDuration(max)}
      </span>
      <button type="button" className="ghost-button pill-button--compact compact-watch-bar__mini" onClick={props.onMini}>
        {t('player.mini')}
      </button>
    </footer>
  );
});
