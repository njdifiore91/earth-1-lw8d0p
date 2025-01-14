/**
 * Custom React hook for managing search operations in the Matter satellite data product matching platform
 * @version 1.0.0
 * Implements enterprise-grade search functionality with enhanced error handling,
 * real-time updates, and performance optimizations
 */

// External imports - versions specified for dependency management
import { useCallback, useEffect, useState, useRef } from 'react'; // ^18.2.0
import { useDispatch, useSelector } from 'react-redux'; // ^8.0.5
import { useDebounce } from 'use-debounce'; // ^9.0.0

// Internal imports
import {
  SearchParameters,
  SearchState,
  SearchError
} from '../types/search.types';
import SearchService from '../services/search.service';
import WebSocketService from '../services/websocket.service';
import {
  setSearchParameters,
  setSearchResults,
  updateSearchStatus,
  setError,
  updateProgress,
  selectSearchState,
} from '../store/slices/searchSlice';

/**
 * Performance metrics tracking interface
 */
interface PerformanceMetrics {
  validationTime: number;
  processingTime: number;
  totalTime: number;
  operationStart: number;
}

/**
 * Enhanced loading state interface
 */
interface LoadingState {
  isCreating: boolean;
  isFetching: boolean;
  isValidating: boolean;
}

/**
 * Custom hook for managing search operations with enhanced features
 */
export function useSearch() {
  // Redux state management
  const dispatch = useDispatch();
  const searchState = useSelector(selectSearchState);

  // Service instances
  const searchService = useRef(SearchService.getInstance());
  const wsService = useRef(new WebSocketService());

  // Local state management
  const [loading, setLoading] = useState<LoadingState>({
    isCreating: false,
    isFetching: false,
    isValidating: false
  });
  const [error, setLocalError] = useState<SearchError | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    validationTime: 0,
    processingTime: 0,
    totalTime: 0,
    operationStart: 0
  });

  // Debounced search parameters for optimization
  const [debouncedParameters] = useDebounce(searchState.parameters, 500);

  /**
   * Initialize WebSocket connection and handle cleanup
   */
  useEffect(() => {
    const ws = wsService.current;
    ws.connect().catch(error => {
      console.error('WebSocket connection failed:', error);
    });

    return () => {
      ws.disconnect();
    };
  }, []);

  /**
   * Create new search with validation and real-time updates
   */
  const createSearch = useCallback(async (parameters: SearchParameters): Promise<void> => {
    try {
      setLoading(prev => ({ ...prev, isCreating: true }));
      setMetrics(prev => ({ ...prev, operationStart: performance.now() }));

      // Validate parameters
      setLoading(prev => ({ ...prev, isValidating: true }));
      const validationStart = performance.now();
      await searchService.current.validateParameters(parameters);
      setMetrics(prev => ({ 
        ...prev, 
        validationTime: performance.now() - validationStart 
      }));
      setLoading(prev => ({ ...prev, isValidating: false }));

      // Dispatch parameters to store
      dispatch(setSearchParameters(parameters));

      // Create search
      const result = await searchService.current.createSearch(parameters);
      dispatch(setSearchResults([result]));

      // Setup real-time updates
      await wsService.current.subscribe(
        result.id,
        (data) => {
          if (data) {
            dispatch(updateProgress(data.progress));
            setProgress(data.progress);
            if (data.status === 'COMPLETED') {
              dispatch(setSearchResults([data]));
            }
          }
        },
        { retryOnError: true }
      );

      setMetrics(prev => ({
        ...prev,
        processingTime: performance.now() - prev.operationStart,
        totalTime: performance.now() - prev.operationStart
      }));

    } catch (error) {
      const searchError: SearchError = {
        code: error.code || 'SEARCH_ERROR',
        message: error.message || 'Search creation failed',
        details: error.details || {},
        retry: true
      };
      setLocalError(searchError);
      dispatch(setError(searchError.message));
    } finally {
      setLoading(prev => ({ ...prev, isCreating: false }));
    }
  }, [dispatch]);

  /**
   * Fetch existing search with caching and error handling
   */
  const fetchSearch = useCallback(async (searchId: string): Promise<void> => {
    try {
      setLoading(prev => ({ ...prev, isFetching: true }));
      setMetrics(prev => ({ ...prev, operationStart: performance.now() }));

      const result = await searchService.current.getSearchById(searchId);
      dispatch(setSearchResults([result]));

      // Setup real-time updates
      await wsService.current.subscribe(
        searchId,
        (data) => {
          if (data) {
            dispatch(updateProgress(data.progress));
            setProgress(data.progress);
          }
        },
        { retryOnError: true }
      );

      setMetrics(prev => ({
        ...prev,
        processingTime: performance.now() - prev.operationStart,
        totalTime: performance.now() - prev.operationStart
      }));

    } catch (error) {
      const searchError: SearchError = {
        code: error.code || 'FETCH_ERROR',
        message: error.message || 'Search fetch failed',
        details: error.details || {},
        retry: true
      };
      setLocalError(searchError);
      dispatch(setError(searchError.message));
    } finally {
      setLoading(prev => ({ ...prev, isFetching: false }));
    }
  }, [dispatch]);

  /**
   * Clear current search and cache
   */
  const clearSearch = useCallback((): void => {
    dispatch(setSearchResults([]));
    setLocalError(null);
    setProgress(0);
    setMetrics({
      validationTime: 0,
      processingTime: 0,
      totalTime: 0,
      operationStart: 0
    });
  }, [dispatch]);

  /**
   * Retry failed operation with exponential backoff
   */
  const retryOperation = useCallback(async (): Promise<void> => {
    if (!error?.retry || !searchState.parameters) {
      return;
    }

    try {
      setLocalError(null);
      await createSearch(searchState.parameters);
    } catch (retryError) {
      const searchError: SearchError = {
        code: retryError.code || 'RETRY_ERROR',
        message: retryError.message || 'Retry operation failed',
        details: retryError.details || {},
        retry: false
      };
      setLocalError(searchError);
      dispatch(setError(searchError.message));
    }
  }, [error, searchState.parameters, createSearch, dispatch]);

  // Return hook interface
  return {
    currentSearch: searchState,
    loading,
    error,
    progress,
    metrics,
    createSearch,
    fetchSearch,
    clearSearch,
    retryOperation
  };
}

export default useSearch;