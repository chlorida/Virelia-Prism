import { memo, useEffect } from 'react';
import { SmartRightPanel } from './SmartRightPanel';
import { useAppShell } from '../../app/AppShellContext';
import { useI18n } from '../../i18n/I18nProvider';
import { useDevRenderCount } from '../../lib/devRenderProfile';

export const QueueSidebar = memo(function QueueSidebar() {
  const shell = useAppShell();
  const { t } = useI18n();
  const presentation = shell.shellPresentation;
  const docked = presentation.effectiveQueueDocked;

  useDevRenderCount('RightSidePanel');

  useEffect(() => {
    if (import.meta.env?.DEV) {
      console.debug('[Virelia layout] RightSidePanel mounted');
    }
  }, []);

  if (presentation.rightPanel === 'hidden') {
    return null;
  }

  const panel = (
    <SmartRightPanel
      presentation={docked ? 'docked' : 'drawer'}
      tabsMode={presentation.rightPanelTabs}
    />
  );

  if (docked) return panel;

  return (
    <div
      className={shell.queueDrawerOpen ? 'queue-drawer-host is-open' : 'queue-drawer-host'}
      aria-hidden={!shell.queueDrawerOpen}
    >
      {panel}
      <button
        type="button"
        className="queue-drawer__close ghost-button"
        aria-label={t('settings.close')}
        onClick={() => shell.setQueueDrawerOpen(false)}
      >
        ×
      </button>
    </div>
  );
});

/** @deprecated Use QueueSidebar */
export const RightSidePanel = QueueSidebar;
