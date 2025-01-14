import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Grid, Paper, CircularProgress, Alert, Snackbar } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { debounce } from 'lodash';
import { ErrorBoundary } from 'react-error-boundary';

// Internal imports
import SearchForm from '../../components/search/SearchForm/SearchForm';
import MapContainer from '../../components/map/MapContainer/MapContainer';
import useSearch from '../../hooks/useSearch';
import { SearchPageProps } from '../../types/search.types';

// Styled components
const styles = {
  container: {
    padding: 3,
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative'
  },
  mapContainer: {
    flex: 1,
    minHeight: '400px',
    marginBottom: 3,
    position: 'relative'
  },
  formContainer: {
    padding: 3,
    zIndex: 1
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '200px',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    zIndex: 2
  },
  progressContainer: {
    position: 'absolute',
    top: 2,
    right: 2,
    zIndex: 3
  }
};

const Search: React.FC<SearchPageProps> = React.memo(({ initialLocation, onError }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  // Initialize search hook with real-time updates
  const {
    currentSearch,
    loading,
    error,
    progress,
    metrics,
    createSearch,
    clearSearch,
    retryOperation
  } = useSearch();

  // Handle search form submission with debouncing
  const handleSearchSubmit = useCallback(
    debounce(async (parameters) => {
      try {
        await createSearch(parameters);
        setSnackbarOpen(true);
      } catch (error) {
        setErrorMessage(error.message);
        onError?.(error);
      }
    }, 300),
    [createSearch, onError]
  );

  // Handle map interaction events
  const handleMapLoad = useCallback((map) => {
    if (initialLocation) {
      map.flyTo({
        center: initialLocation.geometry.coordinates,
        zoom: 12,
        essential: true
      });
    }
  }, [initialLocation]);

  // Handle feature selection on map
  const handleFeatureClick = useCallback((feature) => {
    if (feature && feature.properties) {
      navigate(`/results/${feature.properties.id}`);
    }
  }, [navigate]);

  // Handle map errors
  const handleMapError = useCallback((error) => {
    setErrorMessage(`Map error: ${error.message}`);
    onError?.(error);
  }, [onError]);

  // Handle form validation errors
  const handleValidationError = useCallback((error) => {
    setErrorMessage(error.message);
    onError?.(error);
  }, [onError]);

  // Error boundary fallback component
  const ErrorFallback = useCallback(({ error, resetErrorBoundary }) => (
    <Alert
      severity="error"
      action={
        <button onClick={resetErrorBoundary}>
          Retry
        </button>
      }
    >
      {error.message}
    </Alert>
  ), []);

  // Reset error boundary when location changes
  useEffect(() => {
    return () => {
      clearSearch();
      setErrorMessage(null);
    };
  }, [location.pathname, clearSearch]);

  // Memoized progress indicator
  const progressIndicator = useMemo(() => {
    if (progress > 0 && progress < 100) {
      return (
        <div style={styles.progressContainer}>
          <CircularProgress
            variant="determinate"
            value={progress}
            aria-label={`Search progress: ${progress}%`}
          />
        </div>
      );
    }
    return null;
  }, [progress]);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={retryOperation}
    >
      <Grid container sx={styles.container}>
        {/* Map Container */}
        <Grid item xs={12} sx={styles.mapContainer}>
          <MapContainer
            config={{
              style: 'mapbox://styles/mapbox/satellite-v9',
              center: initialLocation?.geometry.coordinates || [-74.5, 40],
              zoom: 9
            }}
            onMapLoad={handleMapLoad}
            onFeatureClick={handleFeatureClick}
            onError={handleMapError}
            performanceConfig={{
              enabled: true,
              fpsThreshold: 30,
              memoryThreshold: 0.9
            }}
          />
          {progressIndicator}
        </Grid>

        {/* Search Form */}
        <Grid item xs={12}>
          <Paper elevation={3} sx={styles.formContainer}>
            <SearchForm
              onSubmit={handleSearchSubmit}
              onValidationError={handleValidationError}
              initialValues={currentSearch.parameters}
            />
          </Paper>
        </Grid>

        {/* Loading Overlay */}
        {loading.isCreating && (
          <div style={styles.loadingContainer}>
            <CircularProgress size={40} aria-label="Processing search" />
          </div>
        )}

        {/* Error Snackbar */}
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={6000}
          onClose={() => setSnackbarOpen(false)}
        >
          <Alert
            severity={error ? 'error' : 'success'}
            onClose={() => setSnackbarOpen(false)}
          >
            {error ? errorMessage : 'Search completed successfully'}
          </Alert>
        </Snackbar>
      </Grid>
    </ErrorBoundary>
  );
});

Search.displayName = 'Search';

export default Search;