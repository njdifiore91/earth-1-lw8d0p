/**
 * Root Redux Store Configuration for Matter Platform
 * @version 1.0.0
 * Implements enterprise-grade state management with enhanced performance,
 * real-time updates, and comprehensive type safety
 */

// External imports - versions specified for dependency management
import { configureStore, combineReducers } from '@reduxjs/toolkit'; // ^1.9.5
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'; // ^8.1.0
import { createWebSocketMiddleware } from '@redux-websocket'; // ^1.2.0
import { createPerformanceMiddleware } from 'redux-performance-middleware'; // ^1.0.0

// Internal imports - reducers
import authReducer from './slices/authSlice';
import mapReducer from './slices/mapSlice';
import searchReducer from './slices/searchSlice';
import uiReducer from './slices/uiSlice';

// WebSocket configuration
const wsMiddleware = createWebSocketMiddleware({
  url: `${import.meta.env.VITE_WS_URL}/ws`,
  reconnectInterval: 3000,
  maxReconnectAttempts: 5,
  onOpen: () => ({ type: 'WS_CONNECTED' }),
  onClose: () => ({ type: 'WS_DISCONNECTED' }),
  onError: (error) => ({ type: 'WS_ERROR', payload: error })
});

// Performance monitoring middleware
const performanceMiddleware = createPerformanceMiddleware({
  shouldMeasure: (action) => action.type.startsWith('search/'),
  threshold: 100, // ms
  onViolation: (violation) => {
    console.warn('Performance violation:', violation);
  }
});

// Root reducer combining all feature slices
const rootReducer = combineReducers({
  auth: authReducer,
  map: mapReducer,
  search: searchReducer,
  ui: uiReducer
});

// Configure store with middleware and dev tools
export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) => 
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore non-serializable values in specific paths
        ignoredActions: ['map/setMapBounds', 'search/setSearchParameters'],
        ignoredPaths: ['map.bounds', 'search.parameters.location']
      },
      thunk: {
        extraArgument: {
          wsClient: wsMiddleware
        }
      }
    })
    .concat(wsMiddleware)
    .concat(performanceMiddleware),
  devTools: {
    name: 'Matter Platform',
    maxAge: 50,
    trace: true,
    traceLimit: 25,
    serialize: {
      options: {
        undefined: true,
        function: false
      }
    }
  }
});

// Infer root state and dispatch types from store
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Type-safe hooks for use throughout the application
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Export store instance as default
export default store;

/**
 * Type guard to check if a state path exists
 */
export function hasStatePath<T extends keyof RootState>(
  state: RootState,
  path: T
): state is RootState & Required<Pick<RootState, T>> {
  return path in state;
}

/**
 * Performance monitoring utility
 */
export function monitorStorePerformance(
  action: string,
  thresholdMs: number = 100
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const start = performance.now();
      const result = originalMethod.apply(this, args);
      const duration = performance.now() - start;

      if (duration > thresholdMs) {
        console.warn(`Performance warning: ${action} took ${duration}ms`);
      }

      return result;
    };

    return descriptor;
  };
}