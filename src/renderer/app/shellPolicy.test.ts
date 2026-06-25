import { describe, expect, it } from 'vitest';
import { resolveShellPresentation } from './shellPolicy';
import type { ShellPolicyInput } from './shellChromeTypes';

function base(overrides: Partial<ShellPolicyInput> = {}): ShellPolicyInput {
  return {
    layoutMode: 'wide',
    centerColumnCramped: false,
    playerMode: 'library',
    shell: { pinSidebar: false, alwaysShowRightPanel: false },
    sidebarCollapsed: true,
    sidebarDrawerOpen: false,
    queueDrawerOpen: false,
    rightPanelTabs: 'minimal',
    hasCurrentTrack: false,
    queueLength: 0,
    onboardingActive: false,
    videoTheaterOpen: false,
    ...overrides,
  };
}

describe('resolveShellPresentation', () => {
  it('wide idle post-onboarding: rail + compact docked right', () => {
    const p = resolveShellPresentation(base());
    expect(p.sidebar).toBe('rail');
    expect(p.rightPanel).toBe('compact');
    expect(p.rightPanelTabs).toBe('minimal');
    expect(p.effectiveQueueDocked).toBe(true);
  });

  it('pin sidebar forces expanded', () => {
    const p = resolveShellPresentation(base({ shell: { pinSidebar: true, alwaysShowRightPanel: false } }));
    expect(p.sidebar).toBe('expanded');
  });

  it('narrow idle hides right panel', () => {
    const p = resolveShellPresentation(base({ layoutMode: 'narrow' }));
    expect(p.sidebar).toBe('drawer');
    expect(p.rightPanel).toBe('hidden');
  });

  it('playback on narrow opens right drawer context', () => {
    const p = resolveShellPresentation(base({ layoutMode: 'narrow', hasCurrentTrack: true }));
    expect(p.rightPanel).toBe('drawer');
    expect(p.showQueueToggle).toBe(true);
  });

  it('always show right panel keeps compact on wide when idle', () => {
    const p = resolveShellPresentation(base({
      shell: { pinSidebar: false, alwaysShowRightPanel: true },
    }));
    expect(p.rightPanel).toBe('compact');
  });

  it('queue or playback upgrades tabs to full when session expanded', () => {
    const p = resolveShellPresentation(base({
      hasCurrentTrack: true,
      rightPanelTabs: 'full',
    }));
    expect(p.rightPanelTabs).toBe('full');
    expect(p.rightPanel).toBe('docked');
  });

  it('compact idle keeps minimal tabs even if store was expanded', () => {
    const p = resolveShellPresentation(base({ rightPanelTabs: 'full' }));
    expect(p.rightPanel).toBe('compact');
    expect(p.rightPanelTabs).toBe('minimal');
  });

  it('onboarding uses minimal shell without right panel', () => {
    const p = resolveShellPresentation(base({ onboardingActive: true }));
    expect(p.rightPanel).toBe('hidden');
  });

  it('center cramped forces drawer not docked', () => {
    const p = resolveShellPresentation(base({ centerColumnCramped: true }));
    expect(p.effectiveQueueDocked).toBe(false);
    expect(p.rightPanel).toBe('drawer');
  });
});
