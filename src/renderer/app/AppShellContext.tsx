import { createContext, useContext, type ReactNode } from 'react';
import type { AppShellController } from './useAppShellController';

const AppShellContext = createContext<AppShellController | null>(null);

export function AppShellProvider(props: { value: AppShellController; children: ReactNode }) {
  return (
    <AppShellContext.Provider value={props.value}>
      {props.children}
    </AppShellContext.Provider>
  );
}

export function useAppShell(): AppShellController {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used within AppShellProvider');
  return ctx;
}

export function useOptionalAppShell(): AppShellController | null {
  return useContext(AppShellContext);
}
