import { memo } from 'react';
import { useMediaDisplay } from '../../hooks/useResolvedMediaTitle';
import { useI18n } from '../../i18n/I18nProvider';
import { usePlaybackSelector } from '../../playback/usePlayback';

interface WatchHeaderProps {
  theater: boolean;
  onBack: () => void;
}

export const WatchHeader = memo(function WatchHeader(props: WatchHeaderProps) {
  const { t } = useI18n();
  const track = usePlaybackSelector((s) => s.currentTrack);
  const display = useMediaDisplay(track);

  return (
    <header className={`watch-header${props.theater ? ' watch-header--theater' : ''}`}>
      <button type="button" className="watch-header__back ghost-button pill-button--compact" onClick={props.onBack}>
        <span className="watch-header__back-icon" aria-hidden>←</span>
        <span className="watch-header__back-text">{t('player.backToLibrary')}</span>
      </button>
      <div className="watch-header__title-block">
        <span className="watch-header__kind">{t('media.kind.video')}</span>
        <span className="watch-header__title" title={display.title}>
          {display.title || t('player.nothingPlaying')}
        </span>
      </div>
    </header>
  );
});
