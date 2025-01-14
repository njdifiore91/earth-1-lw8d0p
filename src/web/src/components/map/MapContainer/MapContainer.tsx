// @version react@18.2.x
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
// @version mapbox-gl@2.x
import { Map, LngLat, MapboxGeoJSONFeature } from 'mapbox-gl';
// @version classnames@2.x
import classNames from 'classnames';

import { MapConfig, MapState, OfflineConfig, PerformanceConfig } from '../../types/map.types';
import { MAP_DEFAULTS, LAYER_DEFAULTS, PERFORMANCE_SETTINGS } from '../../constants/map.constants';
import { useMap } from '../../hooks/useMap';

interface MapContainerProps {
  config: MapConfig;
  offlineConfig?: OfflineConfig;
  performanceConfig?: PerformanceConfig;
  onMapLoad?: (map: Map) => void;
  onFeatureClick?: (feature: MapboxGeoJSONFeature) => void;
  onBoundsChange?: (bounds: mapboxgl.LngLatBounds) => void;
  onError?: (error: Error) => void;
  onOfflineStatusChange?: (status: { available: boolean; cachedTiles: number; lastSync: Date }) => void;
  onPerformanceAlert?: (metrics: { fps: number; memoryUsage: number; tileLoadTime: number; renderTime: number }) => void;
  className?: string;
}

/**
 * Enhanced MapContainer component with offline support and performance monitoring
 */
export const MapContainer: React.FC<MapContainerProps> = ({
  config,
  offlineConfig = { enabled: false },
  performanceConfig = { 
    enabled: true,
    fpsThreshold: PERFORMANCE_SETTINGS.MAX_FPS,
    memoryThreshold: 0.9
  },
  onMapLoad,
  onFeatureClick,
  onBoundsChange,
  onError,
  onOfflineStatusChange,
  onPerformanceAlert,
  className
}) => {
  // Use enhanced map hook with offline and performance capabilities
  const {
    mapContainerRef,
    map,
    mapState,
    offlineStatus,
    performance,
    setCenter,
    loadKML,
    enableOfflineMode,
    manageTileCache
  } = useMap(config, offlineConfig);

  // Performance monitoring state
  const [performanceWarning, setPerformanceWarning] = useState(false);

  /**
   * Handle map initialization and setup enhanced features
   */
  const handleMapLoad = useCallback((mapInstance: Map) => {
    if (!mapInstance) return;

    // Initialize accessibility features
    mapInstance.getContainer().setAttribute('role', 'application');
    mapInstance.getContainer().setAttribute('aria-label', 'Interactive map');

    // Setup keyboard navigation
    mapInstance.keyboard.enable();
    mapInstance.getContainer().setAttribute('tabindex', '0');

    // Initialize error boundaries
    mapInstance.on('error', (error) => {
      console.error('Map error:', error);
      onError?.(error.error);
    });

    // Setup performance monitoring
    if (performanceConfig.enabled) {
      mapInstance.on('render', () => {
        const metrics = performance;
        if (
          metrics.fps < performanceConfig.fpsThreshold ||
          metrics.memoryUsage > performanceConfig.memoryThreshold
        ) {
          setPerformanceWarning(true);
          onPerformanceAlert?.(metrics);
        } else {
          setPerformanceWarning(false);
        }
      });
    }

    onMapLoad?.(mapInstance);
  }, [onMapLoad, performanceConfig, onPerformanceAlert, performance]);

  /**
   * Handle offline mode transitions
   */
  const handleOfflineTransition = useCallback(async () => {
    try {
      if (offlineConfig.enabled && !offlineStatus.available) {
        await enableOfflineMode();
      }
      onOfflineStatusChange?.(offlineStatus);
    } catch (error) {
      console.error('Offline transition failed:', error);
      onError?.(error as Error);
    }
  }, [offlineConfig.enabled, offlineStatus, enableOfflineMode, onOfflineStatusChange, onError]);

  /**
   * Initialize map and setup event listeners
   */
  useEffect(() => {
    if (map) {
      handleMapLoad(map);

      // Setup feature interaction handlers
      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point);
        if (features.length && onFeatureClick) {
          onFeatureClick(features[0]);
        }
      });

      // Setup bounds change handler
      map.on('moveend', () => {
        const bounds = map.getBounds();
        onBoundsChange?.(bounds);
      });

      // Initialize offline support if configured
      if (offlineConfig.enabled) {
        handleOfflineTransition();
      }
    }
  }, [map, handleMapLoad, onFeatureClick, onBoundsChange, offlineConfig.enabled, handleOfflineTransition]);

  /**
   * Monitor and manage tile cache
   */
  useEffect(() => {
    if (offlineConfig.enabled) {
      const cacheInterval = setInterval(() => {
        manageTileCache().catch((error) => {
          console.error('Cache management failed:', error);
          onError?.(error);
        });
      }, 300000); // Check every 5 minutes

      return () => clearInterval(cacheInterval);
    }
  }, [offlineConfig.enabled, manageTileCache, onError]);

  // Memoized container classes
  const containerClasses = useMemo(() => 
    classNames(
      'map-container',
      {
        'map-container--offline': offlineStatus.available,
        'map-container--performance-warning': performanceWarning
      },
      className
    ),
    [offlineStatus.available, performanceWarning, className]
  );

  return (
    <div 
      ref={mapContainerRef}
      className={containerClasses}
      data-testid="map-container"
    >
      {/* Offline mode indicator */}
      {offlineStatus.available && (
        <div className="map-container__offline-indicator" role="status">
          Offline mode - {offlineStatus.cachedTiles} tiles cached
        </div>
      )}

      {/* Performance warning indicator */}
      {performanceWarning && (
        <div className="map-container__performance-warning" role="alert">
          Performance degradation detected
        </div>
      )}

      {/* Loading indicator */}
      {!map && (
        <div className="map-container__loading" role="progressbar">
          Loading map...
        </div>
      )}
    </div>
  );
};

export default MapContainer;