import { memo, useEffect, useState, type CSSProperties } from 'react';
import { VideoPlayerSurface } from '../player/VideoPlayerSurface';
import { VideoEndScreen } from './VideoEndScreen';
import { usePlaybackSelector } from '../../playback/usePlayback';
import type { MediaItem } from '../../../shared/types';

interface WatchCinemaStageProps {
  heroNext: MediaItem | null;
  onPlayNext: (item: MediaItem) => void;
}

export const WatchCinemaStage = memo(function WatchCinemaStage(props: WatchCinemaStageProps) {
  const playbackStatus = usePlaybackSelector((s) => s.playbackStatus);
  const currentTrack = usePlaybackSelector((s) => s.currentTrack);
  const track = currentTrack;
  const art = track?.albumArtPath;
  const [endDismissed, setEndDismissed] = useState(false);

  useEffect(() => {
    setEndDismissed(false);
  }, [track?.id]);

  const showEnd = playbackStatus === 'ended' && props.heroNext && !endDismissed;

  const bgStyle: CSSProperties | undefined = art
    ? { ['--watch-poster' as string]: `url("${art.replace(/"/g, '%22')}")` }
    : undefined;

  return (
    <section className="watch-stage" style={bgStyle}>
      <div className="watch-stage__ambient" aria-hidden />
      <div className="watch-stage__vignette" aria-hidden />
      <div className="watch-stage__inner">
        <div className="watch-stage__video-shell">
          <VideoPlayerSurface layout="watch" collapsed={false} onToggleCollapsed={() => undefined} />
        </div>
        {showEnd && (
          <VideoEndScreen
            nextItem={props.heroNext}
            onPlayNow={props.onPlayNext}
            onCancel={() => setEndDismissed(true)}
          />
        )}
      </div>
    </section>
  );
});
