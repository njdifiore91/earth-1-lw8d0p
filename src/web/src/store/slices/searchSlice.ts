/**
 * Search Slice for Matter Satellite Data Product Matching Platform
 * @version 1.0.0
 * Implements comprehensive search state management with enhanced validation,
 * caching, and real-time updates
 */

// External imports - version specified for dependency management
import { createSlice, PayloadAction } from '@reduxjs/toolkit'; // ^1.9.0

// Internal imports
import {
  SearchParameters,
  SearchResult,
  SearchState,
  SearchStatus,
  ValidationState,
  CacheStatus,
  ProgressMetrics,
  RetryInfo
} from '../../types/search.types';
import { SearchService } from '../../services/search.service';

/**
 * Enhanced interface for search slice state management
 */
interface SearchSliceState {
  parameters: SearchParameters | null;
  results: SearchResult[];
  status: SearchStatus;
  error: string | null;
  loading: Record<string, boolean>;
  validation: ValidationState;
  cache: CacheStatus;
  progress: ProgressMetrics;
  retryInfo: RetryInfo | null;
  performance: Record<string, number>;
}

/**
 * Initial state with comprehensive type safety
 */
const initialState: SearchSliceState = {
  parameters: null,
  results: [],
  status: 'IDLE',
  error: null,
  loading: {
    parameters: false,
    results: false,
    filters: false,
    validation: false
  },
  validation: {
    isValid: false,
    errors: {},
    lastValidated: null,
    validationVersion: '1.0.0'
  },
  cache: {
    lastUpdated: null,
    isStale: false,
    version: '1.0.0',
    ttl: 5 * 60 * 1000 // 5 minutes
  },
  progress: {
    current: 0,
    total: 0,
    stage: 'IDLE',
    startTime: null,
    estimatedCompletion: null
  },
  retryInfo: null,
  performance: {
    validationTime: 0,
    processingTime: 0,
    renderTime: 0
  }
};

/**
 * Search slice with comprehensive state management
 */
export const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setSearchParameters: (state, action: PayloadAction<SearchParameters>) => {
      const startTime = performance.now();
      state.parameters = action.payload;
      state.loading.parameters = true;
      state.validation.lastValidated = new Date().toISOString();
      state.performance.validationTime = performance.now() - startTime;
    },

    setSearchResults: (state, action: PayloadAction<SearchResult[]>) => {
      const startTime = performance.now();
      state.results = action.payload;
      state.status = 'COMPLETED';
      state.loading.results = false;
      state.cache.lastUpdated = new Date().toISOString();
      state.cache.isStale = false;
      state.performance.processingTime = performance.now() - startTime;
    },

    updateSearchStatus: (state, action: PayloadAction<SearchStatus>) => {
      state.status = action.payload;
      if (action.payload === 'COMPLETED') {
        state.loading.results = false;
        state.progress.stage = 'COMPLETED';
        state.progress.current = state.progress.total;
      }
    },

    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.status = 'FAILED';
      state.loading = { ...state.loading, results: false, parameters: false };
    },

    updateProgress: (state, action: PayloadAction<ProgressMetrics>) => {
      state.progress = {
        ...action.payload,
        startTime: state.progress.startTime || new Date().toISOString()
      };
    },

    setValidationState: (state, action: PayloadAction<ValidationState>) => {
      state.validation = {
        ...action.payload,
        lastValidated: new Date().toISOString()
      };
    },

    updateCacheStatus: (state, action: PayloadAction<Partial<CacheStatus>>) => {
      state.cache = {
        ...state.cache,
        ...action.payload,
        lastUpdated: new Date().toISOString()
      };
    },

    setRetryInfo: (state, action: PayloadAction<RetryInfo>) => {
      state.retryInfo = {
        ...action.payload,
        timestamp: new Date().toISOString()
      };
    },

    resetSearch: (state) => {
      return {
        ...initialState,
        cache: state.cache // Preserve cache across resets
      };
    },

    invalidateCache: (state) => {
      state.cache.isStale = true;
      state.cache.lastUpdated = new Date().toISOString();
    }
  }
});

// Export actions for component usage
export const {
  setSearchParameters,
  setSearchResults,
  updateSearchStatus,
  setError,
  updateProgress,
  setValidationState,
  updateCacheStatus,
  setRetryInfo,
  resetSearch,
  invalidateCache
} = searchSlice.actions;

// Memoized selectors for optimized state access
export const selectSearchState = (state: { search: SearchSliceState }) => state.search;
export const selectSearchParameters = (state: { search: SearchSliceState }) => state.search.parameters;
export const selectSearchResults = (state: { search: SearchSliceState }) => state.search.results;
export const selectSearchStatus = (state: { search: SearchSliceState }) => state.search.status;
export const selectSearchProgress = (state: { search: SearchSliceState }) => state.search.progress;
export const selectSearchValidation = (state: { search: SearchSliceState }) => state.search.validation;
export const selectSearchCache = (state: { search: SearchSliceState }) => state.search.cache;
export const selectSearchPerformance = (state: { search: SearchSliceState }) => state.search.performance;

// Export reducer as default
export default searchSlice.reducer;