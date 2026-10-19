import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './polish.css';

// Register PWA service worker for offline shell caching and native app experience
if ('serviceWorker' in navigator && (import.meta.env.PROD || window.location.protocol === 'https:')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('[PWA] Service Worker registered with scope:', reg.scope);
    }).catch(err => {
      console.warn('[PWA] Service Worker registration failed:', err);
    });
  });
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('Unhandled React error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0e1117', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 12, color: '#f87171' }}>Something went wrong</h2>
          <p style={{ maxWidth: 500, fontSize: '0.875rem', color: '#94a3b8', marginBottom: 20 }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button onClick={() => { window.location.reload(); }} style={{ padding: '8px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

