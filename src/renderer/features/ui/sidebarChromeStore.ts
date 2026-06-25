import { createStore } from '../../lib/createStore';

import { readStored, writeStored, STORAGE_KEYS } from '../../lib/storageKeys';

import type { RightPanelTabs } from '../../app/shellChromeTypes';



interface SidebarChromeState {

  collapsed: boolean;

  rightPanelTabs: RightPanelTabs;

}



let sidebarPinLocked = false;



export function setSidebarPinLocked(locked: boolean): void {

  sidebarPinLocked = locked;

}



export const sidebarChromeStore = createStore<SidebarChromeState>({

  collapsed: readStored(STORAGE_KEYS.sidebarCollapsed, true),

  rightPanelTabs: readStored(STORAGE_KEYS.rightPanelTabsExpanded, false) ? 'full' : 'minimal',

});



export function setSidebarCollapsed(collapsed: boolean): void {

  if (sidebarPinLocked && collapsed) return;

  sidebarChromeStore.patch({ collapsed });

  writeStored(STORAGE_KEYS.sidebarCollapsed, collapsed);

}



export function toggleSidebarCollapsed(): void {

  setSidebarCollapsed(!sidebarChromeStore.getState().collapsed);

}



export function expandRightPanelTabs(): void {

  sidebarChromeStore.patch({ rightPanelTabs: 'full' });

  writeStored(STORAGE_KEYS.rightPanelTabsExpanded, true);

}

