// @version mapbox-gl@2.x
import { Map, LngLat, LngLatBounds, MapboxGeoJSONFeature } from 'mapbox-gl';
// @version @types/geojson@7946.0.10
import { Feature, FeatureCollection, Geometry } from '@types/geojson';

/**
 * Configuration interface for map initialization and behavior
 */
export interface MapConfig {
  style: string;
  center: LngLat;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  bearing: number;
  pitch: number;
  interactive: boolean;
  renderWorldCopies: boolean;
  maxBounds: LngLatBounds | null;
}

/**
 * Interface representing current map state and interaction status
 */
export interface MapState {
  center: LngLat;
  zoom: number;
  bounds: LngLatBounds;
  features: MapboxGeoJSONFeature[];
  drawMode: DrawMode;
  selectedFeatureIds: string[];
  isDrawing: boolean;
  isDragging: boolean;
  lastInteraction: Date;
}

/**
 * Interface for map layer configuration and styling
 */
export interface MapLayer {
  id: string;
  type: LayerType;
  source: Feature | FeatureCollection;
  paint: Record<string, any>;
  layout: Record<string, any>;
  minzoom: number;
  maxzoom: number;
  visibility: LayerVisibility;
  filter: Array<any>;
  metadata: Record<string, any>;
}

/**
 * Available map event types for event handling
 */
export type MapEventType = 
  | 'click' 
  | 'mousemove' 
  | 'dragstart' 
  | 'dragend' 
  | 'zoom' 
  | 'rotate' 
  | 'pitch' 
  | 'boxzoom' 
  | 'load' 
  | 'render' 
  | 'error';

/**
 * Map event handler function type
 */
export type MapEventHandler = (
  event: MapboxGeoJSONFeature,
  lngLat: LngLat,
  point: Point
) => void;

/**
 * Layer visibility options
 */
export type LayerVisibility = 'visible' | 'none';

/**
 * Map interaction configuration options
 */
export type MapInteractionOptions = {
  scrollZoom?: boolean;
  boxZoom?: boolean;
  dragRotate?: boolean;
  dragPan?: boolean;
  keyboard?: boolean;
  doubleClickZoom?: boolean;
  touchZoomRotate?: boolean;
};

/**
 * Available drawing modes for map interaction
 */
export enum DrawMode {
  DRAW_POLYGON = 'draw_polygon',
  DRAW_POINT = 'draw_point',
  DRAW_LINE = 'draw_line',
  DRAW_RECTANGLE = 'draw_rectangle',
  DRAW_CIRCLE = 'draw_circle',
  NONE = 'none'
}

/**
 * Available map layer types for visualization
 */
export enum LayerType {
  FILL = 'fill',
  LINE = 'line',
  SYMBOL = 'symbol',
  CIRCLE = 'circle',
  HEATMAP = 'heatmap',
  RASTER = 'raster'
}