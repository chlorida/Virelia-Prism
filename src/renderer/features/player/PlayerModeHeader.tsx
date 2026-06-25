import { memo } from 'react';

import { useI18n } from '../../i18n/I18nProvider';

import { usePlayback } from '../../playback/usePlayback';

import { useAppShell } from '../../app/AppShellContext';



interface PlayerModeHeaderProps {

  onBack: () => void;

}



export const PlayerModeHeader = memo(function PlayerModeHeader(props: PlayerModeHeaderProps) {

  const { t } = useI18n();

  const { state } = usePlayback();

  const shell = useAppShell();

  const track = state.currentTrack;



  return (

    <header className="player-mode-header">

      <button type="button" className="ghost-button" onClick={props.onBack}>

        {t('player.backToLibrary')}

      </button>

      <div className="player-mode-header__meta">

        <p className="eyebrow">{t('media.kind.video')}</p>

        <h2 title={track?.title}>{track?.title ?? t('player.nothingPlaying')}</h2>

        <small>{track?.artist ?? track?.fileName ?? t('player.selectTrack')}</small>

      </div>

      {shell.showQueueToggle && (

        <button

          type="button"

          className={shell.queueDrawerOpen ? 'ghost-button layout-toggle is-active' : 'ghost-button layout-toggle'}

          aria-pressed={shell.queueDrawerOpen}
          title={shell.queueDrawerOpen ? t('layout.hideRightPanel') : t('layout.showRightPanel')}
          aria-label={shell.queueDrawerOpen ? t('layout.hideRightPanel') : t('layout.showRightPanel')}
          onClick={shell.toggleQueueDrawer}

        >

          {t('layout.toggleQueue')}

        </button>

      )}

    </header>

  );

});


