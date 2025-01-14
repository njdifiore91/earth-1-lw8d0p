// @version mapbox-gl@2.x
import { LngLat } from 'mapbox-gl';
import { MapConfig, DrawMode, LayerType } from '../types/map.types';

// Environment variables and constants
const MAPBOX_ACCESS_TOKEN = process.env.VITE_MAPBOX_ACCESS_TOKEN;

// Map center and zoom level defaults
const DEFAULT_CENTER: [number, number] = [0, 0];
const DEFAULT_ZOOM = 2;
const MIN_ZOOM = 0;
const MAX_ZOOM = 22;

// Map style URLs
const SATELLITE_STYLE = 'mapbox://styles/mapbox/satellite-v9';
const STREETS_STYLE = 'mapbox://styles/mapbox/streets-v12';
const OFFLINE_STYLE = 'mapbox://styles/mapbox/light-v11';

// Map boundaries and cache settings
const MAX_BOUNDS: [number, number, number, number] = [-180, -85, 180, 85];
const TILE_CACHE_SIZE = 100;

/**
 * Primary map configuration with performance optimizations and offline support
 */
export const mapConfig: MapConfig = {
  style: SATELLITE_STYLE,
  center: new LngLat(DEFAULT_CENTER[0], DEFAULT_CENTER[1]),
  zoom: DEFAULT_ZOOM,
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
  bearing: 0,
  pitch: 0,
  interactive: true,
  renderWorldCopies: true,
  maxBounds: MAX_BOUNDS,
  performanceOptimizations: {
    enableTileCache: true,
    tileCacheSize: TILE_CACHE_SIZE,
    useWebGL2: true,
    preserveDrawingBuffer: false,
    antialias: true,
    fadeDuration: 300
  },
  offlineSupport: {
    enabled: true,
    fallbackStyle: OFFLINE_STYLE,
    maxTileCacheSize: 50 * 1024 * 1024, // 50MB
    backgroundSync: true
  }
};

/**
 * Layer styling configuration with performance optimizations
 */
export const layerConfig = {
  fillOpacity: 0.5,
  lineWidth: 2,
  circleRadius: 6,
  performanceMode: {
    simplifyGeometries: true,
    simplificationTolerance: 0.5,
    enableClusteringAtZoom: 10,
    clusterRadius: 50
  },
  zoomBasedStyling: {
    fillOpacityStops: [
      [0, 0.1],
      [10, 0.3],
      [15, 0.5]
    ],
    lineWidthStops: [
      [0, 1],
      [10, 2],
      [15, 3]
    ],
    symbolSizeStops: [
      [0, 0.5],
      [10, 1],
      [15, 1.5]
    ]
  },
  layerTypes: {
    [LayerType.FILL]: {
      paint: {
        'fill-color': '#627BC1',
        'fill-opacity': 0.5
      }
    },
    [LayerType.LINE]: {
      paint: {
        'line-color': '#627BC1',
        'line-width': 2
      }
    },
    [LayerType.CIRCLE]: {
      paint: {
        'circle-color': '#627BC1',
        'circle-radius': 6
      }
    }
  }
};

/**
 * Drawing tool configuration with measurement and validation capabilities
 */
export const drawConfig = {
  mode: DrawMode.NONE,
  lineColor: '#627BC1',
  fillColor: '#627BC1',
  snapToGrid: true,
  measurementTools: {
    enabled: true,
    units: 'kilometers',
    showArea: true,
    showDistance: true,
    precision: 2
  },
  validationRules: {
    minArea: 100, // square meters
    maxArea: 1000000, // square meters
    minVertices: 3,
    maxVertices: 100,
    allowSelfIntersection: false,
    requireClosedPolygons: true
  },
  styles: {
    drawing: {
      'line-color': '#627BC1',
      'line-width': 2,
      'line-opacity': 0.8
    },
    editing: {
      'fill-color': '#627BC1',
      'fill-opacity': 0.3,
      'fill-outline-color': '#627BC1'
    },
    vertex: {
      'circle-radius': 6,
      'circle-color': '#FFFFFF',
      'circle-stroke-color': '#627BC1',
      'circle-stroke-width': 2
    }
  }
};

/**
 * Returns the enhanced map configuration with performance optimizations and offline support
 */
export const getMapConfig = (): MapConfig => {
  if (!MAPBOX_ACCESS_TOKEN) {
    throw new Error('Mapbox access token is required');
  }

  // Check for WebGL2 support and adjust performance settings
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  const hasWebGL2 = !!gl;

  return {
    ...mapConfig,
    performanceOptimizations: {
      ...mapConfig.performanceOptimizations,
      useWebGL2: hasWebGL2
    }
  };
};