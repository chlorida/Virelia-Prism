import { memo, useEffect, useRef, useState } from 'react';
import { dumpPerfSummary, perfMarkShellRendered } from '../lib/perfReport';
import { TitleBar } from '../components/TitleBar';
import { DropOverlay } from '../components/DropOverlay';
import { ToastStack } from '../components/ToastStack';
import { SettingsModal } from '../components/SettingsModal';
import { PromptModal } from '../components/PromptModal';
import { BottomPlayer } from '../components/player/BottomPlayer';
import { CompactWatchBar } from '../components/player/CompactWatchBar';
import { usePlaybackSelector } from '../playback/usePlayback';
import { StartupShell } from '../components/StartupShell';
import { schedulePersistSpeed, schedulePersistVolume } from '../lib/persistPlaybackSettings';
import { saveSettingsPatch } from '../features/settings/settingsStore';
import { useAppShell } from './AppShellContext';
import { AppModeRouter } from './AppModeRouter';
import { ExternalSearchModalHost } from '../components/ExternalSearchModalHost';
import { MiniModeView } from '../features/mini/MiniModeView';
import { FirstRunWizard } from '../components/onboarding/FirstRunWizard';
import { prefetchOnboardingBenchmark } from '../components/onboarding/onboardingBenchmark';
import { WelcomeSetupPromo } from '../components/WelcomeSetupPromo';
import { useStore } from '../lib/useStore';
import { miniShellTransitionStore } from '../features/mini/miniShellTransitionStore';
import { useMiniMorphCompensation } from '../features/mini/useMiniMorphCompensation';
import { playerModeStore } from '../features/ui/playerModeStore';

export const AppFrame = memo(function AppFrame() {
  const shell = useAppShell();
  const isVideo = usePlaybackSelector((s) => s.isVideo);
  const currentTrack = usePlaybackSelector((s) => s.currentTrack);
  const shellMarkedRef = useRef(false);
  const [welcomeSetupOpen, setWelcomeSetupOpen] = useState(false);
  const miniTransition = useStore(miniShellTransitionStore, (state) => state);
  const returnMode = useStore(playerModeStore, (state) => state.returnMode);
  const morphing = miniTransition.phase === 'animating' && miniTransition.direction !== null;
  const morphDir = miniTransition.direction;
  const displayPlayerMode = morphing && morphDir === 'from-mini' ? returnMode : shell.playerMode;
  const isVideoWatch = displayPlayerMode === 'player' && isVideo;
  const showNormalShell = displayPlayerMode !== 'mini' || (morphing && morphDir === 'from-mini');
  const showMiniShell = !miniTransition.suppressMiniChrome
    && (shell.playerMode === 'mini' || (morphing && morphDir === 'to-mini'));
  const compensateRef = useMiniMorphCompensation(
    miniTransition.morphFrom,
    miniTransition.morphTo,
    miniTransition.morphStartedAt,
    miniTransition.direction,
    miniTransition.phase,
    miniTransition.restoreWasMaximized,
    miniTransition.restoreWasFullScreen,
  );

  useEffect(() => {
    if (!shell.settingsLoaded) return;
    if (shell.settings.onboarding?.welcomeCompleted === true && !welcomeSetupOpen) return;
    prefetchOnboardingBenchmark();
  }, [shell.settingsLoaded, shell.settings.onboarding?.welcomeCompleted, welcomeSetupOpen]);

  useEffect(() => {
    if (shellMarkedRef.current || shell.showBootShell) return;
    shellMarkedRef.current = true;
    perfMarkShellRendered();
    globalThis.setTimeout(() => dumpPerfSummary(), 500);
  }, [shell.showBootShell]);

  const onboardingOpen = shell.settingsLoaded
    && !shell.showBootShell
    && (welcomeSetupOpen || shell.settings.onboarding?.welcomeCompleted !== true);

  const normalFrameClass = [
    'app-frame',
    `app-frame--player-mode-${displayPlayerMode}`,
    shell.videoTheaterOpen ? 'app-frame--video-theater' : '',
    isVideoWatch ? 'app-frame--watch-mode' : '',
    onboardingOpen ? 'app-frame--onboarding-active' : '',
    shell.settingsOpen ? 'app-frame--settings-open' : '',
  ].filter(Boolean).join(' ');

  const normalShell = (
    <>
      {shell.showBootShell && (
        <StartupShell message={shell.bootError ?? shell.t(shell.libraryLoading ? 'app.loadingLibrary' : 'app.startingPlayback')} />
      )}
      <TitleBar />
      <ToastStack messages={shell.toastMessages} exitingIds={shell.toastExitingIds} />
      <DropOverlay visible={shell.dragActive} />
      <div className={shell.contentClassName}>
        <button
          type="button"
          className="app-content__backdrop"
          aria-label={shell.t('settings.close')}
          tabIndex={shell.queueDrawerOpen || shell.sidebarDrawerOpen ? 0 : -1}
          onClick={() => {
            shell.setQueueDrawerOpen(false);
            shell.setSidebarDrawerOpen(false);
          }}
        />
        <AppModeRouter />
        <SettingsModal
          open={shell.settingsOpen}
          settings={shell.settings}
          onClose={() => shell.setSettingsOpen(false)}
          onSave={shell.saveSettings}
        />
        {shell.settingsOpen && (
          <WelcomeSetupPromo
            onRun={() => {
              shell.setSettingsOpen(false);
              setWelcomeSetupOpen(true);
            }}
          />
        )}
        <FirstRunWizard
          open={onboardingOpen}
          mode={welcomeSetupOpen ? 'manual' : 'first-run'}
          settings={shell.settings}
          onSave={shell.saveSettings}
          onComplete={() => {
            window.setTimeout(() => {
              document.querySelector('.app-frame')?.classList.remove('app-frame--onboarding-brand-settled');
            }, 1800);
            setWelcomeSetupOpen(false);
          }}
          onImportFolder={shell.importFolder}
        />
        <PromptModal
          open={shell.prompt?.type === 'create-playlist'}
          title={shell.t('prompt.playlist.new')}
          label={shell.t('prompt.playlist.name')}
          defaultValue={shell.t('prompt.playlist.defaultName')}
          confirmLabel={shell.t('prompt.create')}
          onConfirm={(name) => {
            shell.handleCreatePlaylist(name);
            shell.setPrompt(null);
          }}
          onClose={() => shell.setPrompt(null)}
        />
        <PromptModal
          open={shell.prompt?.type === 'rename-playlist'}
          title={shell.t('prompt.playlist.rename')}
          label={shell.t('prompt.playlist.name')}
          inputKey={shell.prompt?.type === 'rename-playlist' ? shell.prompt.playlistId : undefined}
          defaultValue={shell.prompt?.type === 'rename-playlist' ? shell.prompt.defaultValue : ''}
          onConfirm={(name) => {
            if (shell.prompt?.type === 'rename-playlist') shell.handleRenamePlaylist(shell.prompt.playlistId, name);
            shell.setPrompt(null);
          }}
          onClose={() => shell.setPrompt(null)}
        />
        <ExternalSearchModalHost />
      </div>
      <div className="app-player">
        {isVideoWatch ? (
          !shell.videoTheaterOpen ? (
          <CompactWatchBar
            onPrevious={shell.playPrevious}
            onNext={shell.playNext}
            onMini={shell.modeTransitions.toggleMini}
          />
          ) : null
        ) : (
          <BottomPlayer
            playerMode={displayPlayerMode}
            durationSeconds={shell.durationSeconds}
            videoTheater={shell.videoTheaterOpen}
            onVideoTheater={shell.modeTransitions.onVideoTheater}
            onOpenPlayer={() => {
              const track = currentTrack;
              if (track?.filePath) shell.playMedia(track);
            }}
            onBackToLibrary={shell.modeTransitions.enterLibrary}
            onPrevious={shell.playPrevious}
            onNext={shell.playNext}
            onRepeatChange={shell.setRepeatMode}
            onShuffleChange={shell.setShuffleMode}
            onMiniPlayer={shell.modeTransitions.toggleMini}
            onVolumePersist={(volume) => {
              schedulePersistVolume(volume, (patch) => {
                void saveSettingsPatch({ playback: { ...shell.settings.playback, ...patch } });
              });
            }}
            onSpeedPersist={(speed) => {
              schedulePersistSpeed(speed, (patch) => {
                void saveSettingsPatch({ playback: { ...shell.settings.playback, ...patch } });
              });
            }}
          />
        )}
      </div>
    </>
  );

  if (morphing && morphDir) {
    return (
      <div
        className={[
          'app-frame',
          'app-frame--mini-morph',
          `app-frame--mini-morph-${morphDir}`,
          'app-frame--mini-transition',
        ].join(' ')}
      >
        <div ref={compensateRef} className="app-frame__morph-compensate">
        {showNormalShell && (
          <div className={`app-frame__morph-layer app-frame__morph-normal ${normalFrameClass}`}>
            {normalShell}
          </div>
        )}
        {showMiniShell && (
          <div className="app-frame__morph-layer app-frame__morph-mini app-frame--mini-shell">
            <MiniModeView />
          </div>
        )}
        </div>
      </div>
    );
  }

  if (shell.playerMode === 'mini') {
    return (
      <div className="app-frame app-frame--mini-shell">
        <MiniModeView />
      </div>
    );
  }

  return (
    <div className={normalFrameClass}>
      {normalShell}
    </div>
  );
});
