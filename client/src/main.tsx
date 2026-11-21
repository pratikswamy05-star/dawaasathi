import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { initOfflineSync } from './lib/offline';
import { initVoices } from './lib/speech';
import { startAutoTranslate } from './lib/autoTranslate';

/** Friendly fallback instead of a blank screen. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.error(e);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-2xl font-bold">Something went wrong. Your data is safe.</p>
        <button className="rounded-xl bg-navy-800 px-6 py-3 text-xl font-bold text-white" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}

initVoices();
initOfflineSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);

// Translate staff / admin screens (and any leftover English) when Kannada or Hindi is chosen.
startAutoTranslate();
