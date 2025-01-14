/**
 * Root Application Component for Matter Satellite Data Product Matching Platform
 * Implements core routing, authentication, theme management and global layout
 * @version 1.0.0
 */

import React, { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ThemeProvider, CssBaseline, useMediaQuery, CircularProgress } from '@mui/material';
import { styled } from '@mui/material/styles';
import { ErrorBoundary } from 'react-error-boundary';

// Lazy-loaded components
const Login = React.lazy(() => import('./pages/Login/Login'));
const Dashboard = React.lazy(() => import('./pages/Dashboard/Dashboard'));
const Header = React.lazy(() => import('./components/layout/Header/Header'));

// Styled components
const AppContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  backgroundColor: theme.palette.background.default,
  transition: theme.transitions.create(['background-color'], {
    duration: theme.transitions.duration.standard,
  }),
}));

const MainContent = styled('main')(({ theme }) => ({
  flexGrow: 1,
  display: 'flex',
  flexDirection: 'column',
  paddingTop: 64, // Header height
  [theme.breakpoints.up('sm')]: {
    paddingTop: 72,
  },
  overflow: 'auto',
}));

// Loading fallback component
const LoadingFallback = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '100vh' 
  }}>
    <CircularProgress size={40} />
  </div>
);

// Error fallback component
const ErrorFallback = ({ error, resetErrorBoundary }) => (
  <div style={{ 
    padding: '20px', 
    textAlign: 'center', 
    color: 'red' 
  }}>
    <h2>Something went wrong</h2>
    <pre>{error.message}</pre>
    <button onClick={resetErrorBoundary}>Try again</button>
  </div>
);

// Protected route component with MFA support
interface ProtectedRouteProps {
  children: React.ReactNode;
  requireMFA?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requireMFA = false 
}) => {
  const { isAuthenticated, isLoading, mfaRequired, validateSession } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      validateSession();
    }
  }, [isAuthenticated, validateSession]);

  if (isLoading) {
    return <LoadingFallback />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireMFA && !mfaRequired) {
    return <Navigate to="/mfa-setup" replace />;
  }

  return <>{children}</>;
};

/**
 * Root application component with enhanced error handling and performance monitoring
 */
const App: React.FC = () => {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const { theme, setTheme } = useTheme();

  // Handle system theme changes
  useEffect(() => {
    if (theme === 'system') {
      setTheme(prefersDarkMode ? 'dark' : 'light');
    }
  }, [prefersDarkMode, theme, setTheme]);

  // Initialize performance monitoring
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      // Initialize performance monitoring
      window.performance.mark('app-init');
    }
  }, []);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => window.location.reload()}
      onError={(error) => {
        // Log error to monitoring service
        console.error('Application Error:', error);
      }}
    >
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <BrowserRouter>
            <AppContainer>
              <Suspense fallback={<LoadingFallback />}>
                <Header />
                <MainContent>
                  <Routes>
                    {/* Public routes */}
                    <Route 
                      path="/login" 
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <Login />
                        </Suspense>
                      } 
                    />

                    {/* Protected routes */}
                    <Route
                      path="/dashboard"
                      element={
                        <ProtectedRoute>
                          <Suspense fallback={<LoadingFallback />}>
                            <Dashboard />
                          </Suspense>
                        </ProtectedRoute>
                      }
                    />

                    {/* Admin routes with MFA requirement */}
                    <Route
                      path="/admin/*"
                      element={
                        <ProtectedRoute requireMFA>
                          <Suspense fallback={<LoadingFallback />}>
                            {/* Admin components */}
                          </Suspense>
                        </ProtectedRoute>
                      }
                    />

                    {/* Default redirect */}
                    <Route
                      path="*"
                      element={<Navigate to="/dashboard" replace />}
                    />
                  </Routes>
                </MainContent>
              </Suspense>
            </AppContainer>
          </BrowserRouter>
        </ThemeProvider>
      </Provider>
    </ErrorBoundary>
  );
};

export default App;