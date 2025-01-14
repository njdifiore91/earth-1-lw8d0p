// @version react@18.2.x
import React from 'react';
// @version @testing-library/react@14.x
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
// @version mapbox-gl@2.x
import { Map, LngLat, MapboxGeoJSONFeature } from 'mapbox-gl';
// @version vitest@0.34.x
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import { MapContainer } from './MapContainer';
import { MapConfig, MapState, MapPerformanceMetrics } from '../../../types/map.types';
import { MAP_DEFAULTS, PERFORMANCE_SETTINGS } from '../../../constants/map.constants';

// Mock mapbox-gl
vi.mock('mapbox-gl', () => ({
  Map: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    getContainer: vi.fn(() => ({
      setAttribute: vi.fn(),
      removeAttribute: vi.fn()
    })),
    getCanvas: vi.fn(() => ({
      style: {}
    })),
    keyboard: {
      enable: vi.fn(),
      disable: vi.fn()
    },
    flyTo: vi.fn(),
    easeTo: vi.fn(),
    getBounds: vi.fn(() => ({
      extend: vi.fn(),
      getNorthEast: vi.fn(),
      getSouthWest: vi.fn()
    })),
    queryRenderedFeatures: vi.fn(() => []),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn()
  }))
}));

// Mock PerformanceObserver
const mockPerformanceObserver = vi.fn((callback) => ({
  observe: vi.fn(),
  disconnect: vi.fn()
}));
global.PerformanceObserver = mockPerformanceObserver;

// Mock CacheStorage
const mockCacheStorage = {
  open: vi.fn(),
  match: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
};
global.caches = mockCacheStorage;

// Test utilities
const setupMapMock = (options: { 
  isOffline?: boolean;
  performanceIssues?: boolean;
  features?: MapboxGeoJSONFeature[];
} = {}) => {
  const mapInstance = new Map({});
  const eventHandlers: Record<string, Function[]> = {};

  // Enhanced event handling
  mapInstance.on = vi.fn((event, handler) => {
    eventHandlers[event] = eventHandlers[event] || [];
    eventHandlers[event].push(handler);
  });

  // Simulate event triggering
  const triggerMapEvent = (event: string, payload?: any) => {
    eventHandlers[event]?.forEach(handler => handler(payload));
  };

  // Mock performance metrics
  const performanceMetrics = {
    fps: options.performanceIssues ? 20 : 60,
    memoryUsage: options.performanceIssues ? 0.95 : 0.5,
    tileLoadTime: options.performanceIssues ? 500 : 100,
    renderTime: options.performanceIssues ? 100 : 16
  };

  // Mock feature querying
  mapInstance.queryRenderedFeatures = vi.fn(() => options.features || []);

  return { mapInstance, triggerMapEvent, performanceMetrics };
};

// Default test props
const defaultProps = {
  config: {
    style: 'mapbox://styles/mapbox/streets-v12',
    center: new LngLat(0, 0),
    zoom: MAP_DEFAULTS.ZOOM,
    minZoom: MAP_DEFAULTS.MIN_ZOOM,
    maxZoom: MAP_DEFAULTS.MAX_ZOOM,
    bearing: MAP_DEFAULTS.BEARING,
    pitch: MAP_DEFAULTS.PITCH,
    interactive: true,
    renderWorldCopies: true,
    maxBounds: null
  } as MapConfig,
  onMapLoad: vi.fn(),
  onFeatureClick: vi.fn(),
  onBoundsChange: vi.fn(),
  onError: vi.fn(),
  onOfflineStatusChange: vi.fn(),
  onPerformanceAlert: vi.fn()
};

describe('MapContainer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initialization and Rendering', () => {
    it('renders without errors and initializes map', async () => {
      const { mapInstance } = setupMapMock();
      const { container } = render(<MapContainer {...defaultProps} />);

      expect(container.querySelector('[data-testid="map-container"]')).toBeTruthy();
      await waitFor(() => {
        expect(Map).toHaveBeenCalledWith(expect.objectContaining({
          container: expect.any(HTMLElement),
          style: defaultProps.config.style
        }));
      });
    });

    it('sets up accessibility attributes correctly', async () => {
      const { mapInstance } = setupMapMock();
      render(<MapContainer {...defaultProps} />);

      await waitFor(() => {
        expect(mapInstance.getContainer().setAttribute).toHaveBeenCalledWith('role', 'application');
        expect(mapInstance.getContainer().setAttribute).toHaveBeenCalledWith('aria-label', 'Interactive map');
        expect(mapInstance.getContainer().setAttribute).toHaveBeenCalledWith('tabindex', '0');
      });
    });

    it('shows loading state before map initialization', () => {
      render(<MapContainer {...defaultProps} />);
      expect(screen.getByRole('progressbar')).toHaveTextContent('Loading map...');
    });
  });

  describe('Event Handling', () => {
    it('handles feature clicks correctly', async () => {
      const mockFeature = { id: 'test-feature', type: 'Feature' };
      const { mapInstance, triggerMapEvent } = setupMapMock({ features: [mockFeature] });
      
      render(<MapContainer {...defaultProps} />);

      await waitFor(() => {
        triggerMapEvent('click', { point: { x: 100, y: 100 } });
        expect(defaultProps.onFeatureClick).toHaveBeenCalledWith(mockFeature);
      });
    });

    it('handles bounds changes and triggers callback', async () => {
      const { mapInstance, triggerMapEvent } = setupMapMock();
      render(<MapContainer {...defaultProps} />);

      await waitFor(() => {
        triggerMapEvent('moveend');
        expect(defaultProps.onBoundsChange).toHaveBeenCalled();
      });
    });

    it('handles map errors and reports them', async () => {
      const { mapInstance, triggerMapEvent } = setupMapMock();
      render(<MapContainer {...defaultProps} />);

      const testError = new Error('Test map error');
      await waitFor(() => {
        triggerMapEvent('error', { error: testError });
        expect(defaultProps.onError).toHaveBeenCalledWith(testError);
      });
    });
  });

  describe('Offline Capabilities', () => {
    it('displays offline mode indicator when available', async () => {
      const { mapInstance } = setupMapMock({ isOffline: true });
      render(
        <MapContainer 
          {...defaultProps} 
          offlineConfig={{ enabled: true }}
        />
      );

      await waitFor(() => {
        const offlineIndicator = screen.getByRole('status');
        expect(offlineIndicator).toHaveTextContent(/Offline mode/);
      });
    });

    it('manages tile cache according to configuration', async () => {
      const { mapInstance } = setupMapMock();
      render(
        <MapContainer 
          {...defaultProps}
          offlineConfig={{ 
            enabled: true,
            maxCachedTiles: PERFORMANCE_SETTINGS.MAX_CACHED_TILES
          }}
        />
      );

      // Verify cache management is initialized
      await waitFor(() => {
        expect(mockCacheStorage.open).toHaveBeenCalled();
      });
    });
  });

  describe('Performance Monitoring', () => {
    it('triggers performance alerts when thresholds are exceeded', async () => {
      const { mapInstance, triggerMapEvent } = setupMapMock({ performanceIssues: true });
      render(<MapContainer {...defaultProps} />);

      await waitFor(() => {
        triggerMapEvent('render');
        expect(defaultProps.onPerformanceAlert).toHaveBeenCalledWith(
          expect.objectContaining({
            fps: expect.any(Number),
            memoryUsage: expect.any(Number)
          })
        );
      });
    });

    it('displays performance warning when issues are detected', async () => {
      const { mapInstance, triggerMapEvent } = setupMapMock({ performanceIssues: true });
      render(<MapContainer {...defaultProps} />);

      await waitFor(() => {
        triggerMapEvent('render');
        const warning = screen.getByRole('alert');
        expect(warning).toHaveTextContent('Performance degradation detected');
      });
    });
  });

  describe('Responsive Behavior', () => {
    it('adapts to container size changes', async () => {
      const { mapInstance } = setupMapMock();
      const { container } = render(<MapContainer {...defaultProps} />);

      const mapContainer = container.querySelector('[data-testid="map-container"]');
      expect(mapContainer).toHaveStyle({ width: '100%' });

      // Simulate resize
      fireEvent(window, new Event('resize'));
      
      await waitFor(() => {
        expect(mapInstance.easeTo).toHaveBeenCalled();
      });
    });
  });
});