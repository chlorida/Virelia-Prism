import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useI18n } from '../../i18n/I18nProvider';

import { usePlayback } from '../../playback/usePlayback';

import { useStore } from '../../lib/useStore';

import { settingsStore } from '../../features/settings/settingsStore';

import { buildLibraryTitles, findLibraryTitleByMediaId } from '../../lib/mediaIntelligence/libraryTitleService';

import { libraryStore } from '../../features/library/libraryStore';

import { useOptionalAppShell } from '../../app/AppShellContext';

import { getTitleMetadataRecord } from '../../lib/mediaIntelligence/metadata/titleMetadataService';

import { identifyCharacters } from '../../lib/characterRecognition/characterRecognitionService';

import { captureVideoFrame, describeCaptureFailure } from '../../lib/characterRecognition/videoFrameCapture';

import type { CharacterIdentificationResult } from '../../../shared/characterRecognitionTypes';

import { PlayerFeatureChip } from './PlayerFeatureChip';
import { IconCharacterScan, IconCloseSmall } from './PlayerIcons';
import { useOptionalPlayerPopover } from './playerPopoverContext';
import { usePlayerSheetPortal } from './usePlayerSheetPortal';



const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8787';



export function CharacterIdentifyControl() {

  const { t } = useI18n();

  const shell = useOptionalAppShell();

  const { state, actions } = usePlayback();

  const settings = useStore(settingsStore, (s) => s.settings);

  const [panel, setPanel] = useState<CharacterIdentificationResult | null>(null);

  const [busy, setBusy] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

  const panelOpen = Boolean(panel);

  const { mounted: panelMounted, sheetPhaseClass } = usePlayerSheetPortal(panelOpen);

  const popover = useOptionalPlayerPopover();

  useEffect(() => {
    if (panel && popover?.active && popover.active !== 'character-identify') {
      setPanel(null);
    }
  }, [popover?.active, panel]);

  const showPanel = useCallback((result: CharacterIdentificationResult) => {
    popover?.open('character-identify');
    setPanel(result);
  }, [popover]);

  const closePanel = useCallback(() => {
    setPanel(null);
    if (popover?.active === 'character-identify') {
      popover.close();
    }
  }, [popover]);



  const updatePanelPosition = useCallback(() => {

    const button = buttonRef.current;

    if (!button) return;

    const rect = button.getBoundingClientRect();

    setPanelPos({ top: rect.top, left: rect.right });

  }, []);



  useLayoutEffect(() => {

    if (!panelMounted) return;

    updatePanelPosition();

  }, [panelMounted, panel, updatePanelPosition, sheetPhaseClass]);



  useEffect(() => {

    if (!panelMounted) return;

    const onLayout = () => updatePanelPosition();

    window.addEventListener('resize', onLayout);

    window.addEventListener('scroll', onLayout, true);

    return () => {

      window.removeEventListener('resize', onLayout);

      window.removeEventListener('scroll', onLayout, true);

    };

  }, [panelMounted, updatePanelPosition]);



  const media = useStore(libraryStore, (s) => s.media);

  const libraryTitle = useMemo(() => {

    const track = state.currentTrack;

    if (!track) return undefined;

    const titles = buildLibraryTitles(media);

    return findLibraryTitleByMediaId(titles, track.id);

  }, [state.currentTrack, media]);



  const metaRecord = libraryTitle ? getTitleMetadataRecord(libraryTitle) : undefined;

  const knownCharacters = metaRecord?.metadata?.characters ?? [];



  const recognitionMode = settings?.characterRecognition?.mode ?? 'disabled';

  const backendUrl = settings?.characterRecognition?.backendUrl?.trim() ?? '';



  const runIdentify = useCallback(async () => {

    if (!libraryTitle || state.currentTrack?.kind !== 'video') return;



    if (recognitionMode === 'disabled') {

      showPanel({

        titleId: libraryTitle.id,

        timestamp: state.currentTime,

        candidates: [],

        createdAt: Date.now(),

        provider: 'disabled',

        message: 'characterRecognition.disabled',

      });

      return;

    }



    if (recognitionMode === 'local-http') {

      if (!backendUrl || backendUrl === DEFAULT_BACKEND_URL) {

        showPanel({

          titleId: libraryTitle.id,

          timestamp: state.currentTime,

          candidates: [],

          createdAt: Date.now(),

          provider: 'local-http',

          message: 'characterRecognition.backendUrlMissing',

        });

        return;

      }

    }



    setBusy(true);

    try {

      let frame: Blob | undefined;

      if (recognitionMode === 'local-http') {

        const video = actions.getElement();

        const captured = await captureVideoFrame(video);

        if (!captured) {

          const reason = describeCaptureFailure(video);

          showPanel({

            titleId: libraryTitle.id,

            timestamp: state.currentTime,

            candidates: [],

            createdAt: Date.now(),

            provider: 'local-http',

            message: reason,

          });

          return;

        }

        frame = captured;

      }



      const result = await identifyCharacters({

        titleId: libraryTitle.id,

        titleName: libraryTitle.canonicalTitle || libraryTitle.displayTitle,

        timestamp: state.currentTime,

        providerIds: metaRecord?.metadata?.externalIds as Record<string, string | number | undefined>,

        knownCharacters,

        frame,

      });

      showPanel(result);

    } finally {

      setBusy(false);

    }

  }, [

    actions,

    backendUrl,

    knownCharacters,

    libraryTitle,

    metaRecord?.metadata?.externalIds,

    recognitionMode,

    showPanel,

    state.currentTime,

    state.currentTrack?.kind,

  ]);



  if (!state.isPreviewVisible || state.currentTrack?.kind !== 'video') return null;



  return (

    <>

      <PlayerFeatureChip

        ref={buttonRef}

        label={t('characterRecognition.whoOnScreen')}

        open={panelOpen}

        busy={busy}

        onClick={(e) => {

          e.stopPropagation();

          void runIdentify();

        }}

      >

        <IconCharacterScan />

      </PlayerFeatureChip>



      {panelMounted && panel && createPortal(

        <div

          ref={panelRef}

          className={`character-identify-panel player-control-sheet player-control-sheet--anchor-end ${sheetPhaseClass}`}

          style={{ top: panelPos.top, left: panelPos.left }}

          data-video-control

          onClick={(e) => e.stopPropagation()}

        >

          <header className="character-identify-panel__header">

            <div className="character-identify-panel__title">

              <IconCharacterScan width={18} height={18} />

              <strong>{t('characterRecognition.resultsTitle')}</strong>

            </div>

            <button type="button" className="character-identify-panel__close" onClick={closePanel} aria-label={t('settings.close')}>

              <IconCloseSmall />

            </button>

          </header>

          {panel.isMock && (

            <div className="character-identify-panel__banner character-identify-panel__banner--warn">

              {t('characterRecognition.mockWarning')}

            </div>

          )}

          {panel.message && panel.candidates.length === 0 && (

            <div className="character-identify-panel__empty">

              <p>{t(panel.message as Parameters<typeof t>[0])}</p>

              {(panel.provider === 'disabled' || panel.message === 'characterRecognition.backendUrlMissing') && shell && (

                <button type="button" className="character-identify-panel__cta" onClick={() => shell.setSettingsOpen(true)}>

                  {t('characterRecognition.openSettings')}

                </button>

              )}

            </div>

          )}

          {panel.candidates.length > 0 && (

            <ul className="character-identify-panel__list">

              {panel.candidates.map((c) => (

                <li key={`${c.characterId}-${c.name}`} className="character-identify-panel__item">

                  <div className="character-identify-panel__avatar-wrap">

                    {c.imageUrl ? (

                      <img src={c.imageUrl} alt="" className="character-identify-panel__avatar" />

                    ) : (

                      <span className="character-identify-panel__avatar character-identify-panel__avatar--placeholder" aria-hidden>

                        {c.name.charAt(0).toUpperCase()}

                      </span>

                    )}

                    <span className="character-identify-panel__confidence" aria-label={`${Math.round(c.confidence * 100)}%`}>

                      {Math.round(c.confidence * 100)}%

                    </span>

                  </div>

                  <span className="character-identify-panel__name">{c.name}</span>

                </li>

              ))}

            </ul>

          )}

        </div>,

        document.body

      )}

    </>

  );

}

