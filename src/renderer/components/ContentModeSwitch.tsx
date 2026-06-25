import { memo, useEffect } from 'react';
import type { TranslationKey } from '../../shared/i18n';
import { useI18n } from '../i18n/I18nProvider';
import {
  CONTENT_MODE_RAIL_MIN_WIDTH,
  contentModeStore,
  pressContentMode,
} from '../features/content/contentModeStore';
import type { ContentMode } from '../features/content/contentModeTypes';
import { useStore } from '../lib/useStore';

interface ContentModeRailProps {
  mode: ContentMode;
  compact?: boolean;
}

export const ContentModeRail = memo(function ContentModeRail(props: ContentModeRailProps) {
  const { t } = useI18n();
  const options: Array<{ id: ContentMode; icon: string; labelKey: TranslationKey }> = [
    { id: 'video', icon: '▶', labelKey: 'contentMode.video' },
    { id: 'music', icon: '♪', labelKey: 'contentMode.music' },
  ];

  return (
    <div
      className={[
        'content-mode-rail',
        props.compact ? 'content-mode-rail--compact' : '',
        `content-mode-rail--${props.mode}`,
      ].filter(Boolean).join(' ')}
      role="tablist"
      aria-label={t('contentMode.label')}
    >
      <span className="content-mode-rail__indicator" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={props.mode === option.id}
          className={[
            'content-mode-rail__option',
            props.mode === option.id ? 'is-active' : '',
          ].filter(Boolean).join(' ')}
          title={t(option.labelKey)}
          onClick={() => pressContentMode(option.id)}
        >
          <span className="content-mode-rail__icon" aria-hidden>{option.icon}</span>
          <span className="content-mode-rail__label">{t(option.labelKey)}</span>
        </button>
      ))}
    </div>
  );
});

export function useContentModeBodyClass(): ContentMode {
  const mode = useStore(contentModeStore, (state) => state.mode);

  useEffect(() => {
    const root = document.documentElement;
    const apply = (next: ContentMode) => {
      root.classList.toggle('prism-content-music', next === 'music');
      root.classList.toggle('prism-content-video', next === 'video');
    };
    apply(mode);
    return contentModeStore.subscribe((state) => apply(state.mode));
  }, [mode]);

  return mode;
}

export { CONTENT_MODE_RAIL_MIN_WIDTH };
