import { useCallback } from 'react';
import type { AppSettings } from '../../shared/types';
import { defaultUiSoundsSettings } from '../../shared/uiAudioTypes';
import { useI18n } from '../i18n/I18nProvider';
import { useAppShell } from '../app/AppShellContext';
import { useStore } from '../lib/useStore';
import { settingsStore } from '../features/settings/settingsStore';
import { configureUiAudio, playUiSound } from '../services/uiAudioService';

interface UiSoundToggleProps {
  className?: string;
  variant?: 'footer' | 'header' | 'toolbar';
}

export function UiSoundToggle(props: UiSoundToggleProps) {
  const { t } = useI18n();
  const shell = useAppShell();
  const settings = useStore(settingsStore, (state) => state.settings);
  const enabled = settings?.uiSounds?.enabled ?? false;
  const label = t('settings.section.uiSounds');

  const toggle = useCallback(() => {
    const base = settings?.uiSounds ?? defaultUiSoundsSettings();
    const nextEnabled = !enabled;
    const nextUiSounds: AppSettings['uiSounds'] = {
      ...base,
      enabled: nextEnabled,
    };

    configureUiAudio(nextUiSounds);
    if (nextEnabled) {
      playUiSound('confirm');
    }

    void shell.saveSettings({ uiSounds: nextUiSounds }).catch(() => {
      configureUiAudio(base);
    });
  }, [enabled, settings?.uiSounds, shell]);

  return (
    <button
      type="button"
      className={[
        props.variant === 'header' || props.variant === 'toolbar'
          ? 'ghost-button ui-sound-toggle ui-sound-toggle--header'
          : 'ghost-button ui-sound-toggle',
        props.variant === 'toolbar' ? 'ui-sound-toggle--toolbar' : '',
        enabled ? 'ui-sound-toggle--on' : '',
        props.className ?? '',
      ].filter(Boolean).join(' ')}
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      <span className="ui-sound-toggle__icon" aria-hidden>{enabled ? '◉' : '○'}</span>
      {props.variant !== 'toolbar' && (
        <span className="ui-sound-toggle__check" aria-hidden>{enabled ? '✓' : ''}</span>
      )}
      <span className="ui-sound-toggle__label">{label}</span>
    </button>
  );
}
