// @version react@18.2.x
import React from 'react';
// @version @testing-library/react@14.x
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
// @version @testing-library/user-event@14.x
import userEvent from '@testing-library/user-event';
// @version react-redux@8.1.x
import { Provider } from 'react-redux';
// @version @reduxjs/toolkit@1.9.x
import { configureStore } from '@reduxjs/toolkit';

import LayerControl from './LayerControl';
import { LayerType, MapLayer } from '../../../types/map.types';
import { 
  toggleLayerVisibility,
  removeLayer,
  addLayer
} from '../../../store/slices/mapSlice';
import { LAYER_DEFAULTS } from '../../../constants/map.constants';

// Helper function to create test store
const createTestStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      map: (state = initialState, action) => {
        switch (action.type) {
          case 'map/toggleLayerVisibility':
            return {
              ...state,
              layers: {
                ...state.layers,
                [action.payload.layerId]: {
                  ...state.layers[action.payload.layerId],
                  layout: {
                    ...state.layers[action.payload.layerId].layout,
                    visibility: action.payload.visible ? 'visible' : 'none'
                  }
                }
              }
            };
          case 'map/removeLayer':
            const { [action.payload]: removed, ...remainingLayers } = state.layers;
            return {
              ...state,
              layers: remainingLayers
            };
          case 'map/addLayer':
            return {
              ...state,
              layers: {
                ...state.layers,
                [action.payload.id]: action.payload
              }
            };
          default:
            return state;
        }
      }
    }
  });
};

// Helper function to render component with Redux store
const renderWithRedux = (
  component: React.ReactElement,
  { initialState = {} } = {}
) => {
  const store = createTestStore(initialState);
  const user = userEvent.setup();
  return {
    ...render(<Provider store={store}>{component}</Provider>),
    store,
    user
  };
};

// Helper function to create test layers
const createTestLayer = (id: string): MapLayer => ({
  id,
  type: LayerType.FILL,
  source: {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 1], [0, 1], [0, 0]]]
    },
    properties: {}
  },
  paint: {
    'fill-opacity': LAYER_DEFAULTS.FILL_OPACITY
  },
  layout: {
    visibility: 'visible'
  },
  minzoom: 0,
  maxzoom: 22,
  visibility: 'visible',
  filter: [],
  metadata: {
    zIndex: LAYER_DEFAULTS.Z_INDEX_BASE
  }
});

describe('LayerControl', () => {
  // Accessibility Tests
  describe('accessibility', () => {
    it('should have proper ARIA roles and labels', () => {
      const testLayer = createTestLayer('test-layer');
      const { container } = renderWithRedux(
        <LayerControl initialLayers={[testLayer]} />,
        {
          initialState: {
            map: {
              layers: { [testLayer.id]: testLayer }
            }
          }
        }
      );

      expect(screen.getByRole('heading', { name: /layer control/i })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: /toggle test-layer visibility/i })).toBeInTheDocument();
      expect(screen.getByRole('slider', { name: /test-layer opacity/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete test-layer/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const testLayer = createTestLayer('test-layer');
      const { user } = renderWithRedux(
        <LayerControl initialLayers={[testLayer]} />,
        {
          initialState: {
            map: {
              layers: { [testLayer.id]: testLayer }
            }
          }
        }
      );

      const visibilitySwitch = screen.getByRole('switch');
      const opacitySlider = screen.getByRole('slider');
      const deleteButton = screen.getByRole('button', { name: /delete/i });

      // Test keyboard navigation
      await user.tab();
      expect(visibilitySwitch).toHaveFocus();

      await user.tab();
      expect(opacitySlider).toHaveFocus();

      await user.tab();
      expect(deleteButton).toHaveFocus();
    });
  });

  // Layer Management Tests
  describe('layer management', () => {
    it('should toggle layer visibility', async () => {
      const testLayer = createTestLayer('test-layer');
      const { store } = renderWithRedux(
        <LayerControl initialLayers={[testLayer]} />,
        {
          initialState: {
            map: {
              layers: { [testLayer.id]: testLayer }
            }
          }
        }
      );

      const visibilitySwitch = screen.getByRole('switch');
      fireEvent.click(visibilitySwitch);

      await waitFor(() => {
        const state = store.getState();
        expect(state.map.layers[testLayer.id].layout.visibility).toBe('none');
      });
    });

    it('should update layer opacity', async () => {
      const testLayer = createTestLayer('test-layer');
      const { store } = renderWithRedux(
        <LayerControl initialLayers={[testLayer]} />,
        {
          initialState: {
            map: {
              layers: { [testLayer.id]: testLayer }
            }
          }
        }
      );

      const opacitySlider = screen.getByRole('slider');
      fireEvent.change(opacitySlider, { target: { value: '0.7' } });

      await waitFor(() => {
        const state = store.getState();
        expect(state.map.layers[testLayer.id].paint['fill-opacity']).toBe(0.7);
      });
    });

    it('should handle layer deletion', async () => {
      const testLayer = createTestLayer('test-layer');
      const { store } = renderWithRedux(
        <LayerControl initialLayers={[testLayer]} />,
        {
          initialState: {
            map: {
              layers: { [testLayer.id]: testLayer }
            }
          }
        }
      );

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        const state = store.getState();
        expect(state.map.layers[testLayer.id]).toBeUndefined();
      });
    });
  });

  // Performance Tests
  describe('performance', () => {
    it('should handle multiple layers efficiently', async () => {
      const layers = Array.from({ length: 50 }, (_, i) => 
        createTestLayer(`test-layer-${i}`)
      );
      
      const layersObject = layers.reduce((acc, layer) => ({
        ...acc,
        [layer.id]: layer
      }), {});

      const { container } = renderWithRedux(
        <LayerControl initialLayers={layers} />,
        {
          initialState: {
            map: {
              layers: layersObject
            }
          }
        }
      );

      // Verify all layers are rendered
      const layerElements = container.querySelectorAll('[draggable="true"]');
      expect(layerElements).toHaveLength(50);
    });

    it('should batch layer reordering operations', async () => {
      const layers = Array.from({ length: 3 }, (_, i) => 
        createTestLayer(`test-layer-${i}`)
      );
      
      const { container, store } = renderWithRedux(
        <LayerControl initialLayers={layers} />,
        {
          initialState: {
            map: {
              layers: layers.reduce((acc, layer) => ({
                ...acc,
                [layer.id]: layer
              }), {})
            }
          }
        }
      );

      const layerElements = container.querySelectorAll('[draggable="true"]');
      const firstLayer = layerElements[0];
      const lastLayer = layerElements[2];

      // Simulate drag and drop
      fireEvent.dragStart(firstLayer);
      fireEvent.dragOver(lastLayer);
      fireEvent.drop(lastLayer);

      await waitFor(() => {
        const state = store.getState();
        const layerIds = Object.keys(state.map.layers);
        expect(layerIds[layerIds.length - 1]).toBe('test-layer-0');
      });
    });
  });

  // Error Handling Tests
  describe('error handling', () => {
    it('should handle invalid layer configurations gracefully', () => {
      const invalidLayer = {
        ...createTestLayer('invalid-layer'),
        type: 'invalid-type'
      };

      const { container } = renderWithRedux(
        <LayerControl initialLayers={[invalidLayer]} />,
        {
          initialState: {
            map: {
              layers: { [invalidLayer.id]: invalidLayer }
            }
          }
        }
      );

      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
      expect(container).toMatchSnapshot();
    });

    it('should handle missing layer data', () => {
      renderWithRedux(
        <LayerControl initialLayers={[]} />,
        {
          initialState: {
            map: {
              layers: {}
            }
          }
        }
      );

      expect(screen.getByText(/no layers available/i)).toBeInTheDocument();
    });
  });
});