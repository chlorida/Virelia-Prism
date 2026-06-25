import { memo } from 'react';

import { WatchCinemaStage } from '../../components/watch/WatchCinemaStage';

import { WatchHeader } from '../../components/watch/WatchHeader';

import { WatchMetadata } from '../../components/watch/WatchMetadata';

import { WatchTheaterShelf } from '../../components/watch/WatchTheaterShelf';

import { useAppShell } from '../../app/AppShellContext';

import { useLibraryDerivedContext } from '../../app/LibraryDerivedContext';

import { usePlaybackSelector } from '../../playback/usePlayback';

import { useI18n } from '../../i18n/I18nProvider';

import { useSmartUpNextPlan } from '../../lib/mediaIntelligence/useSmartUpNextPlan';

import { useMediaDisplayLanguage } from '../../hooks/useMediaDisplayLanguage';



export const VideoPlayerModeView = memo(function VideoPlayerModeView() {

  const shell = useAppShell();

  const derived = useLibraryDerivedContext();

  const { t, locale } = useI18n();

  const mediaLang = useMediaDisplayLanguage();

  const track = usePlaybackSelector((s) => s.currentTrack);

  const engine = usePlaybackSelector((s) => s.engineStatus.engine);

  const theater = shell.videoTheaterOpen;



  const mediaIndexKey = String(derived.mediaById.size);



  const upNextPlan = useSmartUpNextPlan({

    current: track ?? undefined,

    mediaById: derived.mediaById,

    historyItems: derived.historyItems,

    uiLanguage: shell.settings.uiLanguage,

    metadataLanguage: shell.settings.metadata?.preferredLanguage ?? mediaLang,

    uiLocale: locale,

    mediaIndexKey,

  });



  const heroNext = upNextPlan.hero?.item ?? null;



  if (!track) return null;



  const engineLabel = engine === 'mpv' ? t('player.engine.mpv') : t('player.engine.html5');



  return (

    <div className={`watch-page__main ${theater ? 'watch-page__main--theater' : ''}`}>

      <WatchHeader theater={theater} onBack={shell.modeTransitions.enterLibrary} />

      <div className="watch-page__content">

        <WatchCinemaStage heroNext={heroNext} onPlayNext={(item) => shell.playMedia(item)} />

        <WatchMetadata

          track={track}

          engineLabel={engineLabel}

          theater={theater}

          onFavorite={() => shell.toggleFavorite(track)}

          onQueue={() => shell.addToQueue(track)}

          onPlayNext={() => {

            if (heroNext) shell.playMedia(heroNext);

            else shell.playNext();

          }}

        />

        {theater ? <WatchTheaterShelf /> : null}

      </div>

    </div>

  );

});

