import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { bootstrapPrismApi } from './lib/prismApi';
import { resetAppLocalState } from './lib/appStateReset';
import { startupError, startupLog } from './lib/startupLog';
import { perfMarkAppInit } from './lib/perfReport';
import './styles/player-sliders.css';
import './styles/prism-cinema-context-menu.css';
import './styles/theme.css';
import './styles/motion.css';
import './styles/focus-states.css';
import './styles/layout.css';
import './styles/app-modes.css';
import './styles/video-player.css';
import './styles/player-feature-chip.css';
import './styles/watch-layout.css';
import './styles/watch-cinema.css';
import './styles/cinematic-library.css';
import './styles/title-shelf-scroll.css';
import './styles/title-interactions.css';
import './styles/startup.css';
import './styles/onboarding.css';
import './styles/downloads.css';
import './styles/shell-chrome.css';
import './styles/content-mode-switch.css';
import './styles/motion-interactions.css';
import './styles/prism-toggle.css';

startupLog('renderer entry');
perfMarkAppInit();

if (import.meta.env.DEV) {
  (window as Window & { __vireliaResetState?: () => void }).__vireliaResetState = () => {
    resetAppLocalState();
    window.location.reload();
  };
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  startupError('bootstrap', new Error('#root element not found'));
} else {
  startupLog('root element', 'found');
  const root = createRoot(rootElement);

  void bootstrapPrismApi().then(() => {
    try {
      root.render(
        <React.StrictMode>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </React.StrictMode>
      );
      startupLog('react', 'root render scheduled');
    } catch (error) {
      startupError('react mount', error);
      throw error;
    }
  });
}
