import { memo } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useResolvedMediaTitle } from '../../hooks/useResolvedMediaTitle';
import { usePlayback } from '../../playback/usePlayback';

export const AudioNowPlayingCard = memo(function AudioNowPlayingCard() {
  const { t } = useI18n();
  const { state } = usePlayback();
  const track = state.currentTrack;
  const displayTitle = useResolvedMediaTitle(track);

  if (!track?.filePath || state.isVideo) return null;

  return (
    <div className="audio-stage" aria-label={t('media.audioStage')}>
      <span className="audio-stage__art" aria-hidden>♪</span>
      <div className="audio-stage__copy">
        <strong>{displayTitle}</strong>
        <small>{track.artist ?? track.fileName}</small>
      </div>
    </div>
  );
});
