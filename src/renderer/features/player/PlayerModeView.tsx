import { memo } from 'react';
import { VideoPlayerModeView } from './VideoPlayerModeView';

/** @deprecated Video layout is owned by AppModeRouter; this re-exports the main stage only. */
export const PlayerModeView = memo(function PlayerModeView() {
  return <VideoPlayerModeView />;
});
