let smartRightPanelMountCount = 0;

export function getSmartRightPanelMountCount(): number {
  return smartRightPanelMountCount;
}

export function registerSmartRightPanelMount(): () => void {
  smartRightPanelMountCount += 1;
  if (import.meta.env?.DEV && smartRightPanelMountCount > 1) {
    console.warn(
      `[Virelia layout] SmartRightPanel mounted ${smartRightPanelMountCount} times — right rail must render only once.`,
    );
  }
  return () => {
    smartRightPanelMountCount = Math.max(0, smartRightPanelMountCount - 1);
  };
}
