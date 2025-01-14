// @version mapbox-gl@2.x
import { Map, LngLat, LngLatBounds, MapboxGeoJSONFeature } from 'mapbox-gl';
// @version @types/geojson@7946.0.10
import { Feature, FeatureCollection, Geometry } from '@types/geojson';
import { 
  MapConfig, 
  MapState, 
  DrawMode, 
  LayerType, 
  MapLayer 
} from '../types/map.types';
import {
  MAP_DEFAULTS,
  LAYER_DEFAULTS,
  PERFORMANCE_SETTINGS,
  VALIDATION_LIMITS
} from '../constants/map.constants';

/**
 * Creates a new map layer with specified configuration, including offline support and tile caching
 * @param layerConfig - Layer configuration object
 * @returns Enhanced map layer with caching and offline capabilities
 */
export const createMapLayer = (layerConfig: MapLayer): MapLayer => {
  if (!validateMapLayer(layerConfig)) {
    throw new Error('Invalid layer configuration');
  }

  const enhancedLayer: MapLayer = {
    ...layerConfig,
    paint: {
      ...LAYER_DEFAULTS,
      ...layerConfig.paint
    },
    metadata: {
      ...layerConfig.metadata,
      cached: PERFORMANCE_SETTINGS.PRELOAD_TILES,
      workerCount: PERFORMANCE_SETTINGS.WORKER_COUNT
    }
  };

  if (PERFORMANCE_SETTINGS.PRELOAD_TILES) {
    initializeLayerCache(enhancedLayer);
  }

  return enhancedLayer;
};

/**
 * Converts KML data to GeoJSON format with enhanced validation, caching, and error handling
 * @param kmlData - Raw KML string data
 * @returns Optimized GeoJSON feature collection
 */
export const transformKMLToGeoJSON = async (kmlData: string): Promise<FeatureCollection> => {
  // Validate input
  if (!kmlData || typeof kmlData !== 'string') {
    throw new Error('Invalid KML data');
  }

  // Check cache
  const cacheKey = await generateCacheKey(kmlData);
  const cachedResult = await checkKMLCache(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  // Process large files in Web Worker
  if (kmlData.length > PERFORMANCE_SETTINGS.BATCH_SIZE) {
    return processLargeKML(kmlData);
  }

  // Process smaller files directly
  const parser = new DOMParser();
  const kmlDoc = parser.parseFromString(kmlData, 'text/xml');
  
  const features = extractKMLFeatures(kmlDoc);
  validateFeatures(features);

  const featureCollection: FeatureCollection = {
    type: 'FeatureCollection',
    features: features
  };

  // Cache results
  await cacheKMLResult(cacheKey, featureCollection);

  return featureCollection;
};

/**
 * Validates map layer configuration and ensures compatibility
 * @param config - Layer configuration to validate
 * @returns Validation result with detailed error information
 */
export const validateMapLayer = (config: MapLayer): boolean => {
  if (!config || !config.id || !config.type || !config.source) {
    return false;
  }

  // Validate source data
  if (!validateSourceData(config.source)) {
    return false;
  }

  // Check feature limits
  if (config.source.type === 'FeatureCollection') {
    const featureCount = config.source.features.length;
    if (featureCount > VALIDATION_LIMITS.MAX_FEATURES) {
      return false;
    }
  }

  // Validate zoom levels
  if (
    typeof config.minzoom !== 'undefined' &&
    typeof config.maxzoom !== 'undefined' &&
    config.minzoom > config.maxzoom
  ) {
    return false;
  }

  return true;
};

/**
 * Implements tile caching strategy for offline support
 * @param bounds - Geographic bounds for tile caching
 * @param zoomRange - Zoom level range for caching
 * @returns Promise resolving when caching is complete
 */
export const cacheMapTiles = async (
  bounds: LngLatBounds,
  zoomRange: { min: number; max: number }
): Promise<void> => {
  const tiles = calculateTileCoverage(bounds, zoomRange);
  const existingTiles = await checkTileCache(tiles);
  const missingTiles = tiles.filter(tile => !existingTiles.includes(tile));

  if (missingTiles.length === 0) {
    return;
  }

  // Respect parallel request limits
  const batches = chunk(missingTiles, PERFORMANCE_SETTINGS.MAX_PARALLEL_REQUESTS);
  for (const batch of batches) {
    await Promise.all(batch.map(downloadAndCacheTile));
  }

  await updateCacheManifest(tiles);
};

// Helper functions

const initializeLayerCache = (layer: MapLayer): void => {
  const worker = new Worker('mapWorker.js', { 
    name: `layer-${layer.id}`,
    type: 'module' 
  });
  worker.postMessage({ 
    type: 'INIT_CACHE', 
    layer 
  });
};

const generateCacheKey = async (data: string): Promise<string> => {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

const validateSourceData = (source: Feature | FeatureCollection): boolean => {
  if (!source || !source.type) {
    return false;
  }

  if (source.type === 'Feature' && !source.geometry) {
    return false;
  }

  if (source.type === 'FeatureCollection' && !Array.isArray(source.features)) {
    return false;
  }

  return true;
};

const calculateTileCoverage = (
  bounds: LngLatBounds,
  zoomRange: { min: number; max: number }
): string[] => {
  const tiles: string[] = [];
  for (let z = zoomRange.min; z <= zoomRange.max; z++) {
    const tileBounds = getTileBoundsForZoom(bounds, z);
    for (let x = tileBounds.minX; x <= tileBounds.maxX; x++) {
      for (let y = tileBounds.minY; y <= tileBounds.maxY; y++) {
        tiles.push(`${z}/${x}/${y}`);
      }
    }
  }
  return tiles;
};

const chunk = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

const processLargeKML = async (kmlData: string): Promise<FeatureCollection> => {
  const worker = new Worker('kmlWorker.js', { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(e);
    };
    worker.postMessage({ kmlData });
  });
};