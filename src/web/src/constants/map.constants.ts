// @version mapbox-gl@2.x
import { LngLat, LngLatBounds } from 'mapbox-gl';
import { DrawMode, LayerType } from '../types/map.types';

/**
 * Map style URLs with versioning and fallback options
 * @version mapbox-gl@2.x styles
 */
export const MAP_STYLES = {
  SATELLITE: 'mapbox://styles/mapbox/satellite-v9',
  STREETS: 'mapbox://styles/mapbox/streets-v12',
  TERRAIN: 'mapbox://styles/mapbox/terrain-v2'
} as const;

/**
 * Enhanced default map view settings with 3D controls
 */
export const MAP_DEFAULTS = {
  CENTER: new LngLat(0, 0),
  ZOOM: 2,
  MIN_ZOOM: 0,
  MAX_ZOOM: 22,
  BOUNDS: new LngLatBounds([-180, -85], [180, 85]),
  PITCH: 0,
  BEARING: 0,
  PADDING: 50,
  TRANSITION_DURATION: 500,
  FLY_TO_SPEED: 1.2,
  TERRAIN_EXAGGERATION: 1.5,
  RENDER_WORLD_COPIES: true,
  MAX_PITCH: 85,
  MIN_PITCH: 0
} as const;

/**
 * Extended layer styling parameters with interaction states
 */
export const LAYER_DEFAULTS = {
  FILL_OPACITY: 0.5,
  FILL_OPACITY_ACTIVE: 0.7,
  LINE_WIDTH: 2,
  LINE_WIDTH_ACTIVE: 3,
  CIRCLE_RADIUS: 6,
  CIRCLE_RADIUS_ACTIVE: 8,
  HIGHLIGHT_COLOR: '#FFD700',
  SELECTION_COLOR: '#00FF00',
  INACTIVE_COLOR: '#808080',
  ERROR_COLOR: '#FF0000',
  LINE_DASH_ARRAY: [2, 2],
  SYMBOL_SIZE: 1,
  HEATMAP_INTENSITY: 1,
  HEATMAP_RADIUS: 30,
  RASTER_OPACITY: 1,
  Z_INDEX_BASE: 100,
  Z_INDEX_SELECTED: 200,
  Z_INDEX_HOVER: 300
} as const;

/**
 * Enhanced drawing tool settings with precision controls
 */
export const DRAW_DEFAULTS = {
  MODE: DrawMode.DRAW_POLYGON,
  LINE_COLOR: '#1E90FF',
  FILL_COLOR: 'rgba(30, 144, 255, 0.3)',
  VERTEX_SIZE: 6,
  VERTEX_COLOR: '#FFFFFF',
  MIDPOINT_SIZE: 4,
  SNAP_TOLERANCE: 15,
  GUIDE_DASH_ARRAY: [4, 4],
  GUIDE_COLOR: '#808080',
  MIN_VERTEX_DISTANCE: 2,
  DOUBLE_CLICK_TIMEOUT: 250,
  TOUCH_BUFFER: 25,
  KEYBOARD_STEP: 1,
  KEYBOARD_STEP_LARGE: 10
} as const;

/**
 * Layer type configurations for different visualization modes
 */
export const LAYER_TYPES = {
  FILL: LayerType.FILL,
  LINE: LayerType.LINE,
  SYMBOL: LayerType.SYMBOL,
  CIRCLE: LayerType.CIRCLE,
  HEATMAP: LayerType.HEATMAP,
  RASTER: LayerType.RASTER
} as const;

/**
 * Map interaction timeouts and thresholds
 */
export const INTERACTION_SETTINGS = {
  DEBOUNCE_DELAY: 250,
  THROTTLE_DELAY: 100,
  DOUBLE_CLICK_MS: 300,
  LONG_PRESS_MS: 500,
  DRAG_THRESHOLD: 5,
  PINCH_THRESHOLD: 0.1,
  WHEEL_ZOOM_RATE: 1/450
} as const;

/**
 * Cache and performance optimization settings
 */
export const PERFORMANCE_SETTINGS = {
  MAX_CACHED_TILES: 512,
  TILE_SIZE: 512,
  MAX_PARALLEL_REQUESTS: 16,
  CACHE_EXPIRATION_HOURS: 24,
  PRELOAD_TILES: true,
  FADE_DURATION: 300,
  WORKER_COUNT: navigator.hardwareConcurrency || 4,
  BATCH_SIZE: 1000,
  MAX_FPS: 60
} as const;

/**
 * Error and validation thresholds
 */
export const VALIDATION_LIMITS = {
  MAX_VERTICES: 1000,
  MAX_FEATURES: 5000,
  MAX_AREA_SQKM: 100000,
  MIN_AREA_SQKM: 0.1,
  MAX_LINE_LENGTH_KM: 10000,
  MIN_LINE_LENGTH_KM: 0.01,
  MAX_POINTS: 10000
} as const;