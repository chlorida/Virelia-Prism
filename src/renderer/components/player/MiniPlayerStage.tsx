import { memo, useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { usePlayback } from '../../playback/usePlayback';

interface MiniPlayerStageProps {
  onRestore: () => void;
}

export const MiniPlayerStage = memo(function MiniPlayerStage(props: MiniPlayerStageProps) {
  const { t } = useI18n();
  const { state, actions } = usePlayback();
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    actions.attachPreviewHost(hostRef.current);
    return () => actions.attachPreviewHost(null);
  }, [actions, state.currentTrack?.id]);

  if (!state.isVideo || !state.currentTrack) return null;

  return (
    <section className="mini-player-stage" aria-label={t('player.mini')}>
      <div ref={hostRef} className="mini-player-stage__video" />
      <button
        type="button"
        className="mini-player-stage__restore ghost-button"
        onClick={props.onRestore}
        aria-label={t('player.restoreWindow')}
      >
        {t('player.restoreWindow')}
      </button>
    </section>
  );
});
