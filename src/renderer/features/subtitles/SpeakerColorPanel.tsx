import { useCallback, useEffect, useState } from 'react';
import {
  getOrInferCharacterColor,
  resetCharacterColorOverride,
  setCharacterColorOverride,
} from '../../lib/tauriCommands';
import type { GetCharacterColorResponse } from '../../../shared/subtitleTypes';
import { useI18n } from '../../i18n/I18nProvider';

interface SpeakerColorPanelProps {
  videoKey: string | null;
  videoPath: string | null;
  speakerName: string | null;
  franchiseKey?: string;
}

export function SpeakerColorPanel(props: SpeakerColorPanelProps) {
  const { t } = useI18n();
  const [info, setInfo] = useState<GetCharacterColorResponse | null>(null);
  const [pickColor, setPickColor] = useState('#FFFFFF');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!props.videoKey || !props.speakerName) {
      setInfo(null);
      return;
    }
    setLoading(true);
    try {
      const result = await getOrInferCharacterColor({
        franchiseKey: props.franchiseKey,
        videoKey: props.videoKey,
        videoPath: props.videoPath ?? undefined,
        characterName: props.speakerName,
        speakerId: props.speakerName,
      });
      setInfo(result);
      setPickColor(result.color);
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [props.franchiseKey, props.speakerName, props.videoKey, props.videoPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!props.speakerName) return null;

  return (
    <div className="subtitle-speaker-color-panel">
      <p className="section-label">{t('subtitles.speakerColor.title')}</p>
      <p>{t('subtitles.speakerColor.character', { name: props.speakerName })}</p>
      {loading && <p>{t('subtitles.speakerColor.loading')}</p>}
      {info && (
        <>
          <p className="subtitle-color-preview" style={{ color: info.color }}>
            {t('subtitles.speakerColor.preview')}
          </p>
          <p className="subtitle-color-meta">
            {t('subtitles.speakerColor.source', { source: info.source })}
          </p>
          <p className="subtitle-color-meta">
            {t('subtitles.speakerColor.confidence', { level: info.confidence })}
          </p>
          <label>
            {t('subtitles.speakerColor.change')}
            <input
              type="color"
              value={pickColor}
              onChange={(e) => setPickColor(e.target.value)}
            />
          </label>
          <div className="subtitle-color-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                void setCharacterColorOverride({
                  franchiseKey: props.franchiseKey,
                  videoKey: props.videoKey ?? undefined,
                  characterName: props.speakerName!,
                  color: pickColor,
                  outlineColor: '#000000',
                }).then(() => refresh());
              }}
            >
              {t('subtitles.speakerColor.saveFranchise')}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                void resetCharacterColorOverride({
                  franchiseKey: props.franchiseKey,
                  videoKey: props.videoKey ?? undefined,
                  characterName: props.speakerName!,
                }).then(() => refresh());
              }}
            >
              {t('subtitles.speakerColor.resetAuto')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
