import { memo } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useResolvedMediaTitle } from '../../hooks/useResolvedMediaTitle';
import { usePlayback, usePlaybackSelector } from '../../playback/usePlayback';
import { isActivelyPlaying } from '../../playback/playbackTypes';
import { MediaThumb } from '../../components/watch/MediaThumb';

interface LibraryNowPlayingStripProps {
  onOpenPlayer: () => void;
}

export const LibraryNowPlayingStrip = memo(function LibraryNowPlayingStrip(props: LibraryNowPlayingStripProps) {
  const { t } = useI18n();
  const { actions } = usePlayback();
  const track = usePlaybackSelector((s) => s.currentTrack);
  const isVideo = usePlaybackSelector((s) => s.isVideo);
  const playbackStatus = usePlaybackSelector((s) => s.playbackStatus);
  const displayTitle = useResolvedMediaTitle(track);

  if (!track?.filePath || !isVideo) return null;

  const playing = isActivelyPlaying(playbackStatus);

  return (
    <div className="library-now-playing-strip" role="status" aria-live="polite">
      <MediaThumb item={track} size="row" priority="critical" lazy={false} />
      <span className="library-now-playing-strip__live" aria-hidden>
        <span className={`library-now-playing-strip__dot${playing ? ' is-pulsing' : ''}`} />
      </span>
      <div className="library-now-playing-strip__copy">
        <span className="library-now-playing-strip__badge">{t('smartPanel.nowPlaying.label')}</span>
        <strong title={displayTitle}>{displayTitle}</strong>
      </div>
      <div className="library-now-playing-strip__actions">
        <button
          type="button"
          className="pill-button pill-button--accent"
          aria-label={playing ? t('smartPanel.nowPlaying.pause') : t('smartPanel.nowPlaying.play')}
          onClick={() => { void actions.togglePlay(); }}
        >
          {playing ? t('player.pause') : t('player.play')}
        </button>
        <button
          type="button"
          className="ghost-button library-now-playing-strip__open"
          aria-label={t('player.openPlayer')}
          onClick={props.onOpenPlayer}
        >
          {t('player.openPlayer')}
        </button>
      </div>
    </div>
  );
});
