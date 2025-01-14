/**
 * Entry point for Matter Satellite Data Product Matching Platform
 * @version 1.0.0
 * Implements enterprise-grade React application initialization with
 * Redux store, theme provider, routing, and performance monitoring
 */

// React v18.2.0
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { ErrorBoundary } from 'react-error-boundary';

// Internal imports
import App from './App';
import { store } from './store';

// Performance monitoring
import { initializeMonitoring } from '@monitoring/core'; // v1.0.0

/**
 * Initialize application monitoring and environment-specific configurations
 */
function initializeApp(): void {
  // Initialize performance monitoring in production
  if (process.env.NODE_ENV === 'production') {
    initializeMonitoring({
      appVersion: process.env.APP_VERSION,
      environment: process.env.NODE_ENV,
      sampleRate: 0.1,
      enableMetrics: true,
      reportingEndpoint: process.env.VITE_MONITORING_ENDPOINT
    });

    // Mark initial load
    performance.mark('app-init-start');
  }

  // Polyfill checks for older browsers
  if (!window.crypto) {
    console.warn('Crypto API not available - falling back to polyfill');
    require('crypto-browserify');
  }

  // Validate environment variables
  const requiredEnvVars = [
    'VITE_API_BASE_URL',
    'VITE_AUTH0_DOMAIN',
    'VITE_AUTH0_CLIENT_ID',
    'VITE_MAPBOX_ACCESS_TOKEN'
  ];

  requiredEnvVars.forEach(envVar => {
    if (!import.meta.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  });
}

/**
 * Error fallback component for root-level errors
 */
const RootErrorFallback = ({ error, resetErrorBoundary }) => (
  <div role="alert" style={{ 
    padding: '20px', 
    margin: '20px', 
    border: '1px solid red',
    borderRadius: '4px'
  }}>
    <h2>Application Error</h2>
    <pre style={{ whiteSpace: 'pre-wrap' }}>{error.message}</pre>
    <button
      onClick={resetErrorBoundary}
      style={{ 
        padding: '8px 16px', 
        marginTop: '10px',
        backgroundColor: '#1976d2',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }}
    >
      Reload Application
    </button>
  </div>
);

/**
 * Initialize and render the root React application
 */
function renderApp(): void {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Failed to find root element');
  }

  const root = createRoot(rootElement);

  root.render(
    <StrictMode>
      <ErrorBoundary
        FallbackComponent={RootErrorFallback}
        onReset={() => window.location.reload()}
        onError={(error) => {
          // Log error to monitoring service in production
          if (process.env.NODE_ENV === 'production') {
            console.error('Root Error:', error);
            // Add additional error reporting here
          }
        }}
      >
        <Provider store={store}>
          <App />
        </Provider>
      </ErrorBoundary>
    </StrictMode>
  );

  // Performance measurement for initial render
  if (process.env.NODE_ENV === 'production') {
    performance.mark('app-init-end');
    performance.measure('app-initialization', 'app-init-start', 'app-init-end');
  }

  // Cleanup on unmount
  return () => {
    root.unmount();
    if (process.env.NODE_ENV === 'production') {
      performance.clearMarks();
      performance.clearMeasures();
    }
  };
}

// Initialize application
try {
  initializeApp();
  renderApp();
} catch (error) {
  console.error('Failed to initialize application:', error);
  // Display fallback error UI
  document.body.innerHTML = `
    <div style="padding: 20px; text-align: center;">
      <h1>Application Failed to Load</h1>
      <p>Please try refreshing the page. If the problem persists, contact support.</p>
    </div>
  `;
}

// Enable hot module replacement in development
if (import.meta.hot) {
  import.meta.hot.accept();
}