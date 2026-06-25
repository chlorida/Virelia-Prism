import { createContext, useContext, type ReactNode } from 'react';
import type { AppSettings } from '../../../shared/types';
import { useVideoSubtitles, type VideoSubtitlesState } from './useVideoSubtitles';

const VideoSubtitlesContext = createContext<VideoSubtitlesState | null>(null);

export function VideoSubtitlesProvider(props: { children: ReactNode; settings?: AppSettings }) {
  const value = useVideoSubtitles(props.settings);
  return (
    <VideoSubtitlesContext.Provider value={value}>
      {props.children}
    </VideoSubtitlesContext.Provider>
  );
}

export function useVideoSubtitlesContext(): VideoSubtitlesState {
  const ctx = useContext(VideoSubtitlesContext);
  if (!ctx) {
    throw new Error('useVideoSubtitlesContext must be used within VideoSubtitlesProvider');
  }
  return ctx;
}
