import { memo, useCallback } from 'react';
import { PrismRange } from '../../components/player/PrismRange';
import { useI18n } from '../../i18n/I18nProvider';
import { formatDuration } from '../../lib/search';

interface MiniProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
}

export const MiniProgressBar = memo(function MiniProgressBar(props: MiniProgressBarProps) {
  const { t } = useI18n();
  const max = Math.max(props.duration, 0) || 1;
  const value = Math.min(Math.max(props.currentTime, 0), max);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    props.onSeek(Number(event.target.value));
  }, [props]);

  return (
    <div className="mini-progress-bar">
      <span className="mini-progress-bar__time" aria-hidden>
        {formatDuration(value)}
      </span>
      <div className="mini-progress-bar__track">
        <PrismRange
          variant="seek"
          min={0}
          max={max}
          step={0.01}
          value={value}
          previewFormatter={formatDuration}
          aria-label={t('player.seek')}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
          onChange={handleChange}
        />
      </div>
      <span className="mini-progress-bar__time" aria-hidden>
        {formatDuration(max)}
      </span>
    </div>
  );
});
