// @version mapbox-gl@2.x
import { Map, LngLat, LngLatBounds, MapboxGeoJSONFeature } from 'mapbox-gl';
// @version localforage@1.10.0
import localforage from 'localforage';

import {
  MapConfig,
  MapState,
  DrawMode,
  LayerType,
  MapLayer,
  OfflineConfig,
  CacheConfig,
  PerformanceMetrics
} from '../types/map.types';

import {
  createMapLayer,
  calculateBounds,
  transformKMLToGeoJSON,
  updateMapState,
  validateKML,
  optimizeLayer
} from '../utils/map.utils';

import {
  MAP_DEFAULTS,
  LAYER_DEFAULTS,
  PERFORMANCE_SETTINGS,
  VALIDATION_LIMITS
} from '../constants/map.constants';

/**
 * Enhanced MapService class with offline support and performance optimization
 */
export class MapService {
  private map: Map | null = null;
  private state: MapState;
  private offlineManager: any;
  private cacheManager: any;
  private performanceMonitor: any;
  private layers: Record<string, MapLayer> = {};
  private drawMode: DrawMode = DrawMode.NONE;
  private workerPool: Worker[] = [];
  private tileCache: localforage;

  /**
   * Initialize MapService with enhanced configuration options
   */
  constructor(
    private config: MapConfig,
    private offlineConfig: OfflineConfig,
    private cacheConfig: CacheConfig
  ) {
    this.tileCache = localforage.createInstance({
      name: 'mapTileCache',
      storeName: 'tiles'
    });

    this.state = {
      center: config.center || MAP_DEFAULTS.CENTER,
      zoom: config.zoom || MAP_DEFAULTS.ZOOM,
      bounds: new LngLatBounds(
        [-180, -85],
        [180, 85]
      ),
      features: [],
      drawMode: DrawMode.NONE,
      selectedFeatureIds: [],
      isDrawing: false,
      isDragging: false,
      lastInteraction: new Date()
    };

    this.initializeWorkerPool();
  }

  /**
   * Initialize map instance with enhanced offline capabilities
   */
  public async initializeMap(config: MapConfig): Promise<void> {
    try {
      // Initialize offline capabilities
      await this.initializeOfflineSupport();

      this.map = new Map({
        ...MAP_DEFAULTS,
        ...config,
        container: config.container,
        style: config.style,
        maxTileCacheSize: PERFORMANCE_SETTINGS.MAX_CACHED_TILES,
        preserveDrawingBuffer: this.offlineConfig.enabled,
        optimizeForTerrain: true,
        workerCount: PERFORMANCE_SETTINGS.WORKER_COUNT
      });

      this.setupEventListeners();
      await this.initializePerformanceMonitoring();
      
      // Pre-cache tiles for offline use if configured
      if (this.offlineConfig.enabled) {
        await this.preCacheTiles();
      }

      this.map.once('load', () => {
        this.setupLayerOptimizations();
        this.emitMapReady();
      });

    } catch (error) {
      console.error('Map initialization failed:', error);
      throw new Error('Failed to initialize map service');
    }
  }

  /**
   * Import and process KML data with enhanced validation and chunking
   */
  public async importKML(
    kmlData: string,
    options: { 
      validate?: boolean;
      optimize?: boolean;
      chunked?: boolean 
    } = {}
  ): Promise<{ success: boolean; features: number }> {
    try {
      if (options.validate) {
        const isValid = await validateKML(kmlData);
        if (!isValid) {
          throw new Error('Invalid KML data');
        }
      }

      const geoJSON = await this.processKMLData(kmlData, options);
      const layer = await this.createLayerFromGeoJSON(geoJSON, options);

      return {
        success: true,
        features: geoJSON.features.length
      };

    } catch (error) {
      console.error('KML import failed:', error);
      throw new Error('Failed to import KML data');
    }
  }

  /**
   * Get current offline availability status
   */
  public async getOfflineStatus(): Promise<{
    available: boolean;
    cachedTiles: number;
    lastSync: Date;
  }> {
    const cachedTiles = await this.tileCache.length();
    return {
      available: this.offlineConfig.enabled && cachedTiles > 0,
      cachedTiles,
      lastSync: new Date(await this.tileCache.getItem('lastSync') || Date.now())
    };
  }

  /**
   * Get current performance metrics
   */
  public getPerformanceMetrics(): PerformanceMetrics {
    return {
      fps: this.performanceMonitor.getFPS(),
      memoryUsage: this.performanceMonitor.getMemoryUsage(),
      tileLoadTime: this.performanceMonitor.getAverageTileLoadTime(),
      renderTime: this.performanceMonitor.getAverageRenderTime()
    };
  }

  // Private helper methods

  private async initializeOfflineSupport(): Promise<void> {
    if (this.offlineConfig.enabled) {
      await this.tileCache.setItem('config', this.offlineConfig);
      this.setupServiceWorker();
    }
  }

  private async processKMLData(
    kmlData: string,
    options: { chunked?: boolean }
  ): Promise<any> {
    if (options.chunked && kmlData.length > PERFORMANCE_SETTINGS.BATCH_SIZE) {
      return this.processLargeKML(kmlData);
    }
    return transformKMLToGeoJSON(kmlData);
  }

  private async createLayerFromGeoJSON(
    geoJSON: any,
    options: { optimize?: boolean }
  ): Promise<MapLayer> {
    const layer = createMapLayer({
      id: `layer-${Date.now()}`,
      type: LayerType.FILL,
      source: geoJSON,
      paint: LAYER_DEFAULTS,
      layout: {},
      minzoom: MAP_DEFAULTS.MIN_ZOOM,
      maxzoom: MAP_DEFAULTS.MAX_ZOOM,
      visibility: 'visible',
      filter: [],
      metadata: {}
    });

    if (options.optimize) {
      await optimizeLayer(layer);
    }

    this.layers[layer.id] = layer;
    return layer;
  }

  private initializeWorkerPool(): void {
    const workerCount = PERFORMANCE_SETTINGS.WORKER_COUNT;
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker('mapWorker.js', { type: 'module' });
      this.workerPool.push(worker);
    }
  }

  private async preCacheTiles(): Promise<void> {
    const bounds = this.map?.getBounds() || MAP_DEFAULTS.BOUNDS;
    const zoom = this.map?.getZoom() || MAP_DEFAULTS.ZOOM;
    
    const tilesToCache = this.calculateTilesToCache(bounds, zoom);
    await Promise.all(tilesToCache.map(tile => this.cacheTile(tile)));
  }

  private setupEventListeners(): void {
    if (!this.map) return;

    this.map.on('error', this.handleMapError.bind(this));
    this.map.on('moveend', this.updateMapState.bind(this));
    this.map.on('zoomend', this.handleZoomEnd.bind(this));
    this.map.on('click', this.handleMapClick.bind(this));
  }

  private async initializePerformanceMonitoring(): Promise<void> {
    this.performanceMonitor = {
      fps: 0,
      lastFrame: performance.now(),
      frameCount: 0,
      
      measure: () => {
        const now = performance.now();
        const delta = now - this.performanceMonitor.lastFrame;
        this.performanceMonitor.fps = 1000 / delta;
        this.performanceMonitor.lastFrame = now;
        this.performanceMonitor.frameCount++;
      }
    };

    if (this.map) {
      this.map.on('render', this.performanceMonitor.measure.bind(this));
    }
  }
}