import { isQueueDocked, isQueueDrawerMode } from '../features/ui/queueLayout';
import type { ShellPolicyInput, ShellPresentation } from './shellChromeTypes';

export function resolveShellPresentation(input: ShellPolicyInput): ShellPresentation {
  const queueDockedByWidth = isQueueDocked(input.layoutMode);
  const queueDrawerMode = isQueueDrawerMode(input.layoutMode);
  const effectiveQueueDocked = queueDockedByWidth && !input.centerColumnCramped;

  let sidebar: ShellPresentation['sidebar'] = 'rail';
  if (input.shell.pinSidebar) {
    sidebar = 'expanded';
  } else if (input.layoutMode === 'narrow') {
    sidebar = 'drawer';
  } else if (!input.sidebarCollapsed) {
    sidebar = 'expanded';
  } else {
    sidebar = 'rail';
  }

  let rightPanel: ShellPresentation['rightPanel'] = 'hidden';
  const playbackContext = input.hasCurrentTrack || input.queueLength > 0;

  if (input.onboardingActive || input.videoTheaterOpen) {
    rightPanel = 'hidden';
  } else if (effectiveQueueDocked) {
    if (playbackContext) {
      rightPanel = 'docked';
    } else if (input.layoutMode === 'wide' || input.shell.alwaysShowRightPanel) {
      rightPanel = 'compact';
    } else {
      rightPanel = 'docked';
    }
  } else if (queueDrawerMode || input.centerColumnCramped) {
    const showDrawer =
      playbackContext
      || input.queueDrawerOpen
      || input.shell.alwaysShowRightPanel
      || input.centerColumnCramped;
    rightPanel = showDrawer ? 'drawer' : 'hidden';
  }

  let rightPanelTabs: ShellPresentation['rightPanelTabs'] = input.rightPanelTabs;
  if (rightPanel === 'compact' && !playbackContext) {
    rightPanelTabs = 'minimal';
  }

  const showBackdrop =
    (rightPanel === 'drawer' && input.queueDrawerOpen)
    || (sidebar === 'drawer' && input.sidebarDrawerOpen);

  const contentClasses = [
    'app-content',
    effectiveQueueDocked ? 'app-content--queue-docked' : 'app-content--queue-drawer',
    input.centerColumnCramped ? 'app-content--center-cramped' : '',
    rightPanel === 'drawer' && input.queueDrawerOpen ? 'app-content--queue-open' : '',
    sidebar === 'drawer' && input.sidebarDrawerOpen ? 'app-content--sidebar-open' : '',
    sidebar === 'rail' && input.sidebarCollapsed && !input.shell.pinSidebar
      ? 'app-content--sidebar-collapsed'
      : '',
    rightPanel === 'compact' ? 'app-content--right-compact' : '',
    rightPanel === 'hidden' ? 'app-content--right-hidden' : '',
  ].filter(Boolean);

  return {
    sidebar,
    rightPanel,
    rightPanelTabs,
    showBackdrop,
    effectiveQueueDocked,
    showQueueToggle: queueDrawerMode || input.centerColumnCramped,
    contentClasses,
  };
}
