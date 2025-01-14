import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { LngLat, LngLatBounds, MapboxGeoJSONFeature } from 'mapbox-gl';
import { 
  MapState, 
  DrawMode, 
  LayerType, 
  MapLayer, 
  MapStyle,
  MapFeatureCollection 
} from '../../types/map.types';
import { 
  MAP_STYLES, 
  MAP_DEFAULTS, 
  LAYER_DEFAULTS,
  VALIDATION_LIMITS,
  MAP_ERRORS 
} from '../../constants/map.constants';

// Enhanced interface for map slice state
interface MapSliceState {
  center: LngLat;
  zoom: number;
  bounds: LngLatBounds | null;
  style: MapStyle;
  drawMode: DrawMode;
  layers: Record<string, MapLayer>;
  selectedFeatures: MapFeatureCollection;
  isDrawing: boolean;
  loading: boolean;
  error: string | null;
  lastUpdate: number;
}

// Initial state with enhanced defaults
const initialState: MapSliceState = {
  center: MAP_DEFAULTS.CENTER,
  zoom: MAP_DEFAULTS.ZOOM,
  bounds: null,
  style: MAP_STYLES.SATELLITE,
  drawMode: DrawMode.NONE,
  layers: {},
  selectedFeatures: {
    type: 'FeatureCollection',
    features: []
  },
  isDrawing: false,
  loading: false,
  error: null,
  lastUpdate: Date.now()
};

// Enhanced map slice with comprehensive state management
export const mapSlice = createSlice({
  name: 'map',
  initialState,
  reducers: {
    setMapCenter: (state, action: PayloadAction<LngLat>) => {
      const newCenter = action.payload;
      if (state.bounds && !state.bounds.contains(newCenter)) {
        state.error = MAP_ERRORS.INVALID_CENTER;
        return;
      }
      state.center = newCenter;
      state.error = null;
      state.lastUpdate = Date.now();
    },

    setMapZoom: (state, action: PayloadAction<number>) => {
      const zoom = Math.max(MAP_DEFAULTS.MIN_ZOOM, 
                          Math.min(action.payload, MAP_DEFAULTS.MAX_ZOOM));
      state.zoom = zoom;
      state.lastUpdate = Date.now();
    },

    setMapBounds: (state, action: PayloadAction<LngLatBounds>) => {
      state.bounds = action.payload;
      state.lastUpdate = Date.now();
    },

    setMapStyle: (state, action: PayloadAction<MapStyle>) => {
      state.loading = true;
      state.style = action.payload;
      state.loading = false;
      state.lastUpdate = Date.now();
    },

    setDrawMode: (state, action: PayloadAction<DrawMode>) => {
      state.drawMode = action.payload;
      state.isDrawing = action.payload !== DrawMode.NONE;
      state.lastUpdate = Date.now();
    },

    addLayer: (state, action: PayloadAction<MapLayer>) => {
      const layer = action.payload;
      if (Object.keys(state.layers).length >= VALIDATION_LIMITS.MAX_FEATURES) {
        state.error = MAP_ERRORS.MAX_LAYERS_EXCEEDED;
        return;
      }
      state.layers[layer.id] = {
        ...layer,
        paint: { ...LAYER_DEFAULTS, ...layer.paint }
      };
      state.lastUpdate = Date.now();
    },

    removeLayer: (state, action: PayloadAction<string>) => {
      const { [action.payload]: removed, ...remainingLayers } = state.layers;
      state.layers = remainingLayers;
      state.lastUpdate = Date.now();
    },

    toggleLayerVisibility: (state, action: PayloadAction<{ layerId: string; visible: boolean }>) => {
      const { layerId, visible } = action.payload;
      if (state.layers[layerId]) {
        state.layers[layerId].layout = {
          ...state.layers[layerId].layout,
          visibility: visible ? 'visible' : 'none'
        };
        state.lastUpdate = Date.now();
      }
    },

    setSelectedFeatures: (state, action: PayloadAction<MapboxGeoJSONFeature[]>) => {
      state.selectedFeatures = {
        type: 'FeatureCollection',
        features: action.payload
      };
      state.lastUpdate = Date.now();
    },

    clearSelection: (state) => {
      state.selectedFeatures.features = [];
      state.lastUpdate = Date.now();
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.lastUpdate = Date.now();
    },

    clearError: (state) => {
      state.error = null;
      state.lastUpdate = Date.now();
    }
  }
});

// Enhanced memoized selectors for optimized state access
export const selectMapState = (state: { map: MapSliceState }) => state.map;

export const selectVisibleLayers = createSelector(
  [selectMapState],
  (mapState) => Object.values(mapState.layers).filter(
    layer => layer.layout.visibility === 'visible'
  )
);

export const selectSelectedFeatures = createSelector(
  [selectMapState],
  (mapState) => mapState.selectedFeatures
);

export const selectMapView = createSelector(
  [selectMapState],
  (mapState) => ({
    center: mapState.center,
    zoom: mapState.zoom,
    bounds: mapState.bounds
  })
);

export const selectDrawingState = createSelector(
  [selectMapState],
  (mapState) => ({
    mode: mapState.drawMode,
    isDrawing: mapState.isDrawing
  })
);

// Export actions and reducer
export const { 
  setMapCenter,
  setMapZoom,
  setMapBounds,
  setMapStyle,
  setDrawMode,
  addLayer,
  removeLayer,
  toggleLayerVisibility,
  setSelectedFeatures,
  clearSelection,
  setError,
  clearError
} = mapSlice.actions;

export default mapSlice.reducer;