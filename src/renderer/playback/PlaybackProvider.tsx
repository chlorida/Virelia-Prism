import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { AppSettings } from '../../shared/types';

import { getPrism } from '../lib/prismApi';

import { startupLog } from '../lib/startupLog';

import { MediaController } from './mediaController';

import { createPlaybackStore } from './playbackStore';

import type { PlaybackStore } from './playbackStore';

import { loadPreviewCollapsed, savePreviewCollapsed } from './mediaPersistence';

import { PlaybackContext, PlaybackStoreContext, type PlaybackActions } from './usePlayback';

import type { MediaErrorKey } from './mediaErrors';

import { waitForMediaController } from './controllerReady';
import { initUiAudioSystem, registerPlaybackStoreForUiAudio } from '../services/uiAudioInit';



interface PlaybackProviderProps {

  children: ReactNode;

  settings?: AppSettings;

  translateError: (key: MediaErrorKey) => string;

  onEndedRef?: React.MutableRefObject<(() => void) | undefined>;

  onEngineStatus?: (status: import('./playbackTypes').UnifiedPlaybackState['engineStatus']) => void;

}



export function PlaybackProvider(props: PlaybackProviderProps) {

  const sinkRef = useRef<HTMLDivElement>(null);

  const storeRef = useRef<PlaybackStore>(createPlaybackStore({

    volume: props.settings?.playback.volume ?? 0.74,

    playbackRate: props.settings?.playback.speed ?? 1,

    muted: props.settings?.playback.muted ?? false,

    repeat: props.settings?.playback.repeat ?? 'off',

    shuffle: props.settings?.playback.shuffle ?? false,

    isPreviewCollapsed: loadPreviewCollapsed(),

  }));

  const controllerRef = useRef<MediaController | null>(null);
  const previewHostRef = useRef<HTMLElement | null>(null);
  const [controllerReady, setControllerReady] = useState(false);



  const translateError = props.translateError;

  const onEndedRef = useRef(props.onEndedRef);

  onEndedRef.current = props.onEndedRef;



  useEffect(() => {

    if (!props.settings) return;

    storeRef.current.patch({

      volume: props.settings.playback.volume,

      playbackRate: props.settings.playback.speed,

      muted: props.settings.playback.muted,

      repeat: props.settings.playback.repeat,

      shuffle: props.settings.playback.shuffle,

    });

  }, [

    props.settings?.playback.volume,

    props.settings?.playback.speed,

    props.settings?.playback.muted,

    props.settings?.playback.repeat,

    props.settings?.playback.shuffle,

  ]);



  useEffect(() => {

    const sink = sinkRef.current;

    if (!sink) return;



    const controller = new MediaController(storeRef.current, {

      translateError,

      onEnded: () => onEndedRef.current?.current?.(),

      onPersist: () => savePreviewCollapsed(storeRef.current.getState().isPreviewCollapsed),

    });

    controller.ensureElement(sink);

    controllerRef.current = controller;

    if (previewHostRef.current) {
      controller.attachPreviewHost(previewHostRef.current);
    }

    setControllerReady(true);

    startupLog('playback controller ready');

    const teardownUiAudioPlayback = registerPlaybackStoreForUiAudio(storeRef.current);

    const prism = getPrism();

    if (prism) {

      void prism.playback.status().then((status) => {

        storeRef.current.patch({

          engineStatus: status.engineStatus,

          repeat: status.repeat,

          shuffle: status.shuffle,

        });

        props.onEngineStatus?.(status.engineStatus);

      }).catch(() => undefined);

    }



    return () => {
      teardownUiAudioPlayback();
      controller.destroy();

      controllerRef.current = null;

      setControllerReady(false);

    };

  }, [translateError]);



  const runWithController = useCallback(<T,>(
    fn: (controller: MediaController) => T | Promise<T>,
    label: string,
  ): Promise<T | undefined> => {
    const ready = controllerRef.current;
    if (ready) {
      return Promise.resolve(fn(ready));
    }
    return waitForMediaController(() => controllerRef.current).then((controller) => {
      if (!controller) {
        console.warn(`[Virelia playback] ${label} skipped — controller not ready`);
        return undefined;
      }
      return fn(controller);
    });
  }, []);

  const runWithControllerSync = useCallback((
    fn: (controller: MediaController) => void,
    label: string,
  ): void => {
    const controller = controllerRef.current;
    if (!controller) {
      console.warn(`[Virelia playback] ${label} skipped — controller not ready`);
      return;
    }
    fn(controller);
  }, []);



  const actions = useMemo<PlaybackActions>(() => ({

    whenReady: () => waitForMediaController(() => controllerRef.current).then((c) => {

      if (!c) throw new Error('Playback engine not ready');

    }),

    loadTrack: async (track, options) => {

      await runWithController((controller) => controller.loadTrack(track, options), 'loadTrack');

    },

    play: async () => {

      await runWithController((controller) => controller.play(), 'play');

    },

    pause: () => runWithControllerSync((controller) => { controller.pause(); }, 'pause'),

    togglePlay: () => runWithControllerSync((controller) => { controller.togglePlay(); }, 'togglePlay'),

    seek: async (seconds) => {

      await runWithController((controller) => controller.seek(seconds), 'seek');

    },

    setVolume: (value) => runWithControllerSync((controller) => { controller.setVolume(value); }, 'setVolume'),

    setMuted: (muted) => runWithControllerSync((controller) => { controller.setMuted(muted); }, 'setMuted'),

    setPlaybackRate: (rate) => runWithControllerSync((controller) => { controller.setPlaybackRate(rate); }, 'setPlaybackRate'),

    stop: () => runWithControllerSync((controller) => { controller.stop(); }, 'stop'),

    enterFullscreen: (target) => runWithControllerSync((controller) => { controller.enterFullscreen(target); }, 'enterFullscreen'),

    exitFullscreen: () => runWithControllerSync((controller) => { controller.exitFullscreen(); }, 'exitFullscreen'),

    setPreviewCollapsed: (collapsed) => {

      storeRef.current.patch({ isPreviewCollapsed: collapsed });

      savePreviewCollapsed(collapsed);

    },

    setRepeat: (repeat) => storeRef.current.patch({ repeat }),

    setShuffle: (shuffle) => storeRef.current.patch({ shuffle }),

    attachPreviewHost: (host) => {
      previewHostRef.current = host;

      const apply = () => {
        controllerRef.current?.attachPreviewHost(previewHostRef.current);
      };

      if (controllerRef.current) {
        apply();
        return;
      }

      void waitForMediaController(() => controllerRef.current).then(() => {
        apply();
      });
    },

    getElement: () => controllerRef.current?.getElement() ?? null,

  }), [runWithController, runWithControllerSync]);



  const value = useMemo(() => ({

    actions,

    controllerReady,

  }), [actions, controllerReady]);



  return (

    <PlaybackStoreContext.Provider value={storeRef.current}>

      <PlaybackContext.Provider value={value}>

        <div ref={sinkRef} className="prism-media-engine-sink" aria-hidden />

        {props.children}

      </PlaybackContext.Provider>

    </PlaybackStoreContext.Provider>

  );

}


