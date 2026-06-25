/** Legacy audio player layout — audio playback uses library mode. Kept for tests. */
import { memo } from 'react';
import { usePlayback } from '../../playback/usePlayback';
import { useI18n } from '../../i18n/I18nProvider';
import { useResolvedMediaTitle } from '../../hooks/useResolvedMediaTitle';
import { isActivelyPlaying } from '../../playback/playbackTypes';

export const AudioPlayerModeView = memo(function AudioPlayerModeView() {
  const { t } = useI18n();
  const { state, actions } = usePlayback();
  const track = state.currentTrack;
  const displayTitle = useResolvedMediaTitle(track);
  if (!track) {
    return (
      <div className="player-mode-empty">
        <p>{t('player.selectTrack')}</p>
      </div>
    );
  }

  const playing = isActivelyPlaying(state.playbackStatus);

  return (
    <section className="audio-player-mode" aria-label={t('media.audioStage')}>
      <div className="audio-player-mode__art" aria-hidden>♪</div>
      <div className="audio-player-mode__copy">
        <h3>{displayTitle}</h3>
        <p>{track.artist ?? track.fileName}</p>
        <small>{track.folderLabel ?? track.folder}</small>
      </div>
      <div className="audio-player-mode__primary">
        <button type="button" className="play-button" onClick={() => actions.togglePlay()}>
          {playing ? t('player.pause') : t('player.play')}
        </button>
      </div>
    </section>
  );
});
