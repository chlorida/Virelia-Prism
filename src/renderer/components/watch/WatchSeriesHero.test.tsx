// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WatchSeriesHero } from './WatchSeriesHero';
import type { SmartUpNextPlan } from '../../lib/mediaIntelligence/types';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'en',
  }),
}));

vi.mock('../../hooks/useMediaDisplayLanguage', () => ({
  useMediaDisplayLanguage: () => 'en',
}));

const playbackMockState = {
  currentTrack: {
    id: 'v1',
    filePath: 'D:/a.mkv',
    fileName: 'a.mkv',
    folder: 'D:/',
    title: 'Episode',
    tags: [],
    kind: 'video',
    addedAt: '',
    favorite: false,
  },
  playbackStatus: 'playing' as const,
  currentTime: 120,
  duration: 600,
};

vi.mock('../../playback/usePlayback', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../playback/usePlayback')>();
  return {
    ...actual,
    usePlayback: () => ({
      actions: { togglePlay: vi.fn(), setPreviewCollapsed: vi.fn() },
      controllerReady: true,
    }),
    usePlaybackSelector: (selector: (s: typeof playbackMockState) => unknown) =>
      selector(playbackMockState),
  };
});

const plan: SmartUpNextPlan = {
  hero: null,
  sections: [],
  displayIdentity: null,
  series: null,
  currentIdentity: {
    rawFilename: 'a.mkv',
    rawTitle: 'Episode',
    cleanBaseName: 'Episode',
    cleanTitle: 'Episode',
    displayTitle: 'Episode',
    probableTitle: 'Episode',
    episodeNumber: 3,
    technicalTags: [],
    junkTags: [],
    confidence: 1,
  },
  episodeIndex: 3,
  episodeCount: 12,
};

describe('WatchSeriesHero', () => {
  it('shows playing progress while playback is active', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(WatchSeriesHero, { plan }));
    });
    const progress = container.querySelector('.now-playing-card__progress-track');
    expect(progress?.getAttribute('aria-label')).toBe('smartPanel.nowPlaying.progress');
    expect(container.querySelector('.now-playing-card__dot.is-pulsing')).not.toBeNull();
    await act(async () => root.unmount());
    container.remove();
  });
});
