import { memo, useRef } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { usePlaybackSelector } from '../../playback/usePlayback';
import { useManagedPreviewHost } from '../../playback/useManagedPreviewHost';
import { useStore } from '../../lib/useStore';
import { settingsStore } from '../../features/settings/settingsStore';
import { VideoSubtitlesProvider } from '../../features/subtitles/VideoSubtitlesContext';
import { VideoControlsOverlay } from './VideoControlsOverlay';
import { useVideoPlayerChrome } from './useVideoPlayerChrome';

interface VideoPlayerSurfaceProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  layout?: 'library' | 'watch';
}

export const VideoPlayerSurface = memo(function VideoPlayerSurface(props: VideoPlayerSurfaceProps) {
  const { t } = useI18n();
  const isPreviewVisible = usePlaybackSelector((s) => s.isPreviewVisible);
  const currentTrack = usePlaybackSelector((s) => s.currentTrack);
  const playbackStatus = usePlaybackSelector((s) => s.playbackStatus);
  const error = usePlaybackSelector((s) => s.error);
  const settings = useStore(settingsStore, (s) => s.settings);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const attachHost = useManagedPreviewHost('player', true);
  const chrome = useVideoPlayerChrome(surfaceRef);

  if (!isPreviewVisible || !currentTrack) return null;

  const collapsed = props.collapsed;
  const watchLayout = props.layout === 'watch';

  const surfaceClass = [
    'video-stage__surface',
    'video-shell',
    collapsed ? 'video-stage__surface--collapsed' : '',
    chrome.idleCursor ? 'video-shell--idle-cursor' : '',
    chrome.showControls ? 'video-shell--controls-visible' : '',
  ].filter(Boolean).join(' ');

  return (
    <section
      className={[
        'video-stage-host',
        'video-stage-host--visible',
        'video-player',
        watchLayout ? 'video-stage-host--watch' : '',
        collapsed ? 'video-stage-host--collapsed' : '',
      ].filter(Boolean).join(' ')}
      aria-label={t('media.videoStage')}
    >
      {!watchLayout && (
        <div className="video-stage-host__toolbar">
          <span className="video-stage-host__badge">{t('media.kind.video')}</span>
          <button
            type="button"
            className="video-stage__toggle"
            aria-expanded={!collapsed}
            onClick={props.onToggleCollapsed}
          >
            {collapsed ? t('media.video.expand') : t('media.video.collapse')}
          </button>
        </div>
      )}

      <div
        ref={surfaceRef}
        className={surfaceClass}
        onClick={chrome.handleSurfaceClick}
        onDoubleClick={chrome.handleSurfaceDoubleClick}
        onPointerEnter={chrome.handleSurfacePointerEnter}
        onPointerMove={chrome.handleSurfacePointerMove}
        onPointerLeave={chrome.handleSurfacePointerLeave}
      >
        <div ref={attachHost} className="video-stage__media-host" />

        {playbackStatus === 'error' && !collapsed && (
          <div className="video-stage__error" role="alert">
            <strong>{error}</strong>
          </div>
        )}

        {!collapsed && (
          <VideoSubtitlesProvider settings={settings}>
            <VideoControlsOverlay
              surfaceRef={surfaceRef}
              layout={props.layout}
              chrome={chrome}
            />
          </VideoSubtitlesProvider>
        )}
      </div>
    </section>
  );
});
