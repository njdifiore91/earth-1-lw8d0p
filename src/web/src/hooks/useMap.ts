// @version react@18.2.x
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
// @version mapbox-gl@2.x
import { Map, LngLat, LngLatBounds, MapboxGeoJSONFeature } from 'mapbox-gl';
// @version @monitoring/performance@1.x
import { usePerformanceMonitor } from '@monitoring/performance';

import { 
  MapConfig, 
  MapState, 
  DrawMode, 
  OfflineConfig 
} from '../types/map.types';
import { 
  MAP_DEFAULTS, 
  LAYER_DEFAULTS, 
  PERFORMANCE_SETTINGS 
} from '../constants/map.constants';
import { MapService } from '../services/map.service';

/**
 * Enhanced custom hook for managing map functionality with offline support
 * and performance monitoring capabilities
 */
export const useMap = (
  config: MapConfig,
  offlineConfig: OfflineConfig = { enabled: false }
) => {
  // Core refs and state
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapServiceRef = useRef<MapService | null>(null);
  const [map, setMap] = useState<Map | null>(null);
  const [mapState, setMapState] = useState<MapState>({
    center: config.center || MAP_DEFAULTS.CENTER,
    zoom: config.zoom || MAP_DEFAULTS.ZOOM,
    bounds: new LngLatBounds([-180, -85], [180, 85]),
    features: [],
    drawMode: DrawMode.NONE,
    selectedFeatureIds: [],
    isDrawing: false,
    isDragging: false,
    lastInteraction: new Date()
  });

  // Performance monitoring
  const performance = usePerformanceMonitor({
    enabled: true,
    sampleRate: PERFORMANCE_SETTINGS.MAX_FPS,
    memoryWarningThreshold: 0.9
  });

  // Offline status state
  const [offlineStatus, setOfflineStatus] = useState({
    available: false,
    cachedTiles: 0,
    lastSync: new Date()
  });

  /**
   * Initialize map instance and setup enhanced features
   */
  useEffect(() => {
    const initializeMap = async () => {
      if (!mapContainerRef.current) return;

      try {
        mapServiceRef.current = new MapService(config, offlineConfig, {
          maxCachedTiles: PERFORMANCE_SETTINGS.MAX_CACHED_TILES,
          cacheExpirationHours: PERFORMANCE_SETTINGS.CACHE_EXPIRATION_HOURS,
          preloadTiles: PERFORMANCE_SETTINGS.PRELOAD_TILES
        });

        await mapServiceRef.current.initializeMap({
          ...config,
          container: mapContainerRef.current
        });

        const mapInstance = mapServiceRef.current.getMap();
        if (mapInstance) {
          setMap(mapInstance);
          updateOfflineStatus();
        }
      } catch (error) {
        console.error('Map initialization failed:', error);
        performance.logError('map_init_failed', { error });
      }
    };

    initializeMap();

    return () => {
      if (mapServiceRef.current) {
        performance.endSession();
        mapServiceRef.current.cleanup();
      }
    };
  }, []);

  /**
   * Update offline status periodically
   */
  useEffect(() => {
    if (!offlineConfig.enabled) return;

    const updateStatus = async () => {
      if (mapServiceRef.current) {
        const status = await mapServiceRef.current.getOfflineStatus();
        setOfflineStatus(status);
      }
    };

    const interval = setInterval(updateStatus, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [offlineConfig.enabled]);

  /**
   * Set map center with performance tracking
   */
  const setCenter = useCallback((center: LngLat, zoom?: number) => {
    performance.startOperation('set_center');
    
    if (map) {
      map.flyTo({
        center,
        zoom: zoom || map.getZoom(),
        speed: MAP_DEFAULTS.FLY_TO_SPEED,
        curve: 1.42,
        essential: true
      });
    }

    performance.endOperation('set_center');
  }, [map]);

  /**
   * Load and process KML data with progress tracking
   */
  const loadKML = useCallback(async (kmlData: string) => {
    if (!mapServiceRef.current) return;

    performance.startOperation('kml_load');
    try {
      const result = await mapServiceRef.current.importKML(kmlData, {
        validate: true,
        optimize: true,
        chunked: true
      });

      if (result.success) {
        performance.logMetric('kml_features_loaded', result.features);
      }

      return result;
    } catch (error) {
      performance.logError('kml_load_failed', { error });
      throw error;
    } finally {
      performance.endOperation('kml_load');
    }
  }, []);

  /**
   * Enable offline mode with tile pre-caching
   */
  const enableOfflineMode = useCallback(async () => {
    if (!mapServiceRef.current) return;

    performance.startOperation('enable_offline');
    try {
      await mapServiceRef.current.enableOfflineMode();
      const status = await mapServiceRef.current.getOfflineStatus();
      setOfflineStatus(status);
      
      performance.logMetric('cached_tiles', status.cachedTiles);
    } catch (error) {
      performance.logError('offline_mode_failed', { error });
      throw error;
    } finally {
      performance.endOperation('enable_offline');
    }
  }, []);

  /**
   * Manage tile cache with size optimization
   */
  const manageTileCache = useCallback(async () => {
    if (!mapServiceRef.current) return;

    performance.startOperation('cache_management');
    try {
      await mapServiceRef.current.manageTileCache({
        maxSize: PERFORMANCE_SETTINGS.MAX_CACHED_TILES,
        expirationHours: PERFORMANCE_SETTINGS.CACHE_EXPIRATION_HOURS
      });
      
      const status = await mapServiceRef.current.getOfflineStatus();
      setOfflineStatus(status);
    } catch (error) {
      performance.logError('cache_management_failed', { error });
      throw error;
    } finally {
      performance.endOperation('cache_management');
    }
  }, []);

  // Memoized performance metrics
  const performanceMetrics = useMemo(() => ({
    ...performance.getMetrics(),
    mapMetrics: mapServiceRef.current?.getPerformanceMetrics()
  }), [performance]);

  return {
    mapContainerRef,
    map,
    mapState,
    offlineStatus,
    performance: performanceMetrics,
    setCenter,
    loadKML,
    enableOfflineMode,
    manageTileCache
  };
};