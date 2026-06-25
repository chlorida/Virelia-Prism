import { memo } from 'react';
import { usePlaybackSelector } from '../../playback/usePlayback';
import { useAppShell } from '../../app/AppShellContext';
import { MINI_AUDIO_SIZE, MINI_VIDEO_SIZE } from '../../../shared/miniWindowGeometry';
import { AudioMiniView } from './AudioMiniView';
import { VideoMiniView } from './VideoMiniView';
import { MiniWindowChrome } from './MiniWindowChrome';
import { useMiniGeometryGuard } from './useMiniGeometryGuard';

export const MiniModeView = memo(function MiniModeView() {
  const shell = useAppShell();
  const isVideo = usePlaybackSelector((s) => s.isVideo);
  const size = isVideo ? MINI_VIDEO_SIZE : MINI_AUDIO_SIZE;

  useMiniGeometryGuard(isVideo ? 'video' : 'audio');

  const shellClass = [
    'mini-shell',
    `mini-shell--${isVideo ? 'video' : 'audio'}`,
  ].join(' ');

  return (
    <div
      className={shellClass}
      style={
        {
          '--mini-card-width': `${size.width}px`,
          '--mini-card-height': `${size.height}px`
        } as React.CSSProperties
      }
    >
      <MiniWindowChrome
        onRestore={() => shell.modeTransitions.restoreMini()}
        onClose={() => shell.modeTransitions.closeMiniToLibrary()}
      />
      <div className="mini-card">
        {isVideo ? (
          <VideoMiniView
            durationSeconds={shell.durationSeconds}
            onPrevious={shell.playPrevious}
            onNext={shell.playNext}
          />
        ) : (
          <AudioMiniView
            durationSeconds={shell.durationSeconds}
            onPrevious={shell.playPrevious}
            onNext={shell.playNext}
          />
        )}
      </div>
    </div>
  );
});
