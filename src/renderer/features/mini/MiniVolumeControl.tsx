import { memo, useCallback } from 'react';
import { PrismRange } from '../../components/player/PrismRange';
import { useI18n } from '../../i18n/I18nProvider';
import { usePlayback, usePlaybackSelector } from '../../playback/usePlayback';

export const MiniVolumeControl = memo(function MiniVolumeControl() {
  const { t } = useI18n();
  const { actions } = usePlayback();
  const volume = usePlaybackSelector((s) => s.volume);
  const muted = usePlaybackSelector((s) => s.muted);

  const handleVolume = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (muted) actions.setMuted(false);
    actions.setVolume(next);
  }, [actions, muted]);

  return (
    <div className="mini-volume" role="group" aria-label={t('player.volume')}>
      <button
        type="button"
        className="mini-volume__mute"
        aria-label={muted ? t('player.unmute') : t('player.mute')}
        aria-pressed={muted}
        onClick={() => actions.setMuted(!muted)}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <PrismRange
        variant="volume"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        aria-label={t('player.volume')}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={muted ? 0 : volume}
        onChange={handleVolume}
      />
    </div>
  );
});
