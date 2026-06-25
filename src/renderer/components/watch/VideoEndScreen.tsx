import { memo, useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { MediaItem } from '../../../shared/types';
import { MediaThumb } from './MediaThumb';

const COUNTDOWN_SEC = 8;

interface VideoEndScreenProps {
  nextItem: MediaItem | null;
  onPlayNow: (item: MediaItem) => void;
  onCancel: () => void;
}

export const VideoEndScreen = memo(function VideoEndScreen(props: VideoEndScreenProps) {
  const { t } = useI18n();
  const [seconds, setSeconds] = useState(COUNTDOWN_SEC);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (!props.nextItem || cancelled) return;
    setSeconds(COUNTDOWN_SEC);
    const id = globalThis.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          globalThis.clearInterval(id);
          props.onPlayNow(props.nextItem!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => globalThis.clearInterval(id);
  }, [props.nextItem, cancelled, props.onPlayNow]);

  if (!props.nextItem) return null;

  return (
    <div className="video-end-screen" role="dialog" aria-label={t('watch.upNextOverlay')}>
      <div className="video-end-screen__card">
        <p className="video-end-screen__label">{t('watch.upNextIn')}</p>
        <MediaThumb item={props.nextItem} size="hero" />
        <strong className="video-end-screen__title">{props.nextItem.title}</strong>
        <p className="video-end-screen__countdown">{t('watch.startsIn', { sec: seconds })}</p>
        <div className="video-end-screen__actions">
          <button type="button" className="pill-button pill-button--accent" onClick={() => props.onPlayNow(props.nextItem!)}>
            {t('watch.playNow')}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setCancelled(true);
              props.onCancel();
            }}
          >
            {t('watch.cancelAutoplay')}
          </button>
        </div>
      </div>
    </div>
  );
});
