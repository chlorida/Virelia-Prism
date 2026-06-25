import { AppFrame } from './AppFrame';
import { AppShellProvider } from './AppShellContext';
import { LibraryDerivedProvider } from './LibraryDerivedContext';
import { useAppShellController } from './useAppShellController';

function AppShellInner(props: {
  onEndedRef: React.MutableRefObject<() => void>;
}) {
  const controller = useAppShellController(props);

  return (
    <AppShellProvider value={controller}>
      <AppFrame />
    </AppShellProvider>
  );
}

export function AppShell(props: {
  onEndedRef: React.MutableRefObject<() => void>;
}) {
  return (
    <LibraryDerivedProvider>
      <AppShellInner {...props} />
    </LibraryDerivedProvider>
  );
}
