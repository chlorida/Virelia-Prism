import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { getPrism } from '../lib/prismApi';
import { useStore } from '../lib/useStore';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  CONTENT_MODE_RAIL_MIN_WIDTH,
  useContentModeBodyClass,
} from './ContentModeSwitch';
import { ContentModeSwitchHost } from './ContentModeSwitchHost';
import { shouldShowContentModeSwitch } from '../features/content/contentModeVisibility';
import { libraryRouterStore } from '../features/library/libraryRouterStore';
import { playerModeStore } from '../features/ui/playerModeStore';

export function TitleBar() {
  const { t } = useI18n();
  const [maximized, setMaximized] = useState(false);
  const titleBarRef = useRef<HTMLElement>(null);
  const brandAnchorRef = useRef<HTMLSpanElement>(null);
  const route = useStore(libraryRouterStore, (state) => state.route);
  const playerMode = useStore(playerModeStore, (state) => state.mode);
  const contentMode = useContentModeBodyClass();
  const wideRail = useMediaQuery(`(min-width: ${CONTENT_MODE_RAIL_MIN_WIDTH}px)`);
  const showSwitch = shouldShowContentModeSwitch(route, playerMode);

  useEffect(() => {
    const prism = getPrism();
    if (!prism) return;
    void prism.window.isMaximized().then(setMaximized);
    return prism.window.onMaximizeChange(setMaximized);
  }, []);

  async function toggleMaximize() {
    const prism = getPrism();
    if (!prism) return;
    setMaximized(await prism.window.toggleMaximize());
  }

  return (
    <header
      ref={titleBarRef}
      className={[
        'title-bar',
        contentMode === 'music' ? 'title-bar--music' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="title-bar__start">
        <div
          className="title-bar-brand"
          onDoubleClick={() => void toggleMaximize()}
        >
          <span className="sr-only" data-onboarding-brand-target="mark" aria-hidden="true" />
          <span className="title-bar-brand-sweep" aria-hidden="true" />
          <div className="title-bar-brand-text">
            <span className="title-bar-company" data-onboarding-brand-target="company">Virelia</span>
            <span className="title-bar-product" data-onboarding-brand-target="product">Prism</span>
          </div>
          {showSwitch && (
            <span
              ref={brandAnchorRef}
              className="title-bar__switch-anchor title-bar__switch-anchor--brand"
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {showSwitch && (
        <div className="title-bar__mode-switch-layer">
          <ContentModeSwitchHost
            titleBarRef={titleBarRef}
            brandAnchorRef={brandAnchorRef}
            mode={contentMode}
            wide={wideRail}
          />
        </div>
      )}

      <div className="title-bar-controls">
        <button
          type="button"
          className="title-bar-btn"
          aria-label={t('title.minimize')}
          title={t('title.minimize')}
          onClick={() => { void getPrism()?.window.minimize(); }}
        >
          <span aria-hidden>─</span>
        </button>
        <button
          type="button"
          className="title-bar-btn"
          aria-label={maximized ? t('title.restore') : t('title.maximize')}
          title={maximized ? t('title.restore') : t('title.maximize')}
          onClick={() => void toggleMaximize()}
        >
          <span aria-hidden>{maximized ? '❐' : '□'}</span>
        </button>
        <button
          type="button"
          className="title-bar-btn title-bar-btn--close"
          aria-label={t('title.close')}
          title={t('title.close')}
          onClick={() => { void getPrism()?.window.close(); }}
        >
          <span aria-hidden>×</span>
        </button>
      </div>
    </header>
  );
}
