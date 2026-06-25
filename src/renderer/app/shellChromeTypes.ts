import type { ShellSettings } from '../../shared/types';
import type { AppLayoutMode } from '../hooks/useAppLayoutMode';
import type { PlayerMode } from '../features/ui/playerModeTypes';

export type SidebarPresentation = 'expanded' | 'rail' | 'drawer';
export type RightPanelPresentation = 'hidden' | 'compact' | 'docked' | 'drawer';
export type RightPanelTabs = 'minimal' | 'full';

export type { ShellSettings };

export interface ShellPolicyInput {
  layoutMode: AppLayoutMode;
  centerColumnCramped: boolean;
  playerMode: PlayerMode;
  shell: ShellSettings;
  sidebarCollapsed: boolean;
  sidebarDrawerOpen: boolean;
  queueDrawerOpen: boolean;
  rightPanelTabs: RightPanelTabs;
  hasCurrentTrack: boolean;
  queueLength: number;
  onboardingActive: boolean;
  videoTheaterOpen: boolean;
}

export interface ShellPresentation {
  sidebar: SidebarPresentation;
  rightPanel: RightPanelPresentation;
  rightPanelTabs: RightPanelTabs;
  showBackdrop: boolean;
  effectiveQueueDocked: boolean;
  showQueueToggle: boolean;
  contentClasses: string[];
}
