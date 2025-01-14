// @version react@18.2.x
import React from 'react';
// @version @testing-library/react@14.x
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// @version react-redux@8.x
import { Provider } from 'react-redux';
// @version @reduxjs/toolkit@1.9.x
import { configureStore } from '@reduxjs/toolkit';
// @version jest-axe@7.x
import { axe, toHaveNoViolations } from 'jest-axe';

// Internal imports
import { MapControls } from './MapControls';
import { DrawMode } from '../../../types/map.types';
import { useMap } from '../../../hooks/useMap';

// Extend expect with accessibility matchers
expect.extend(toHaveNoViolations);

// Mock the useMap hook
jest.mock('../../../hooks/useMap');

describe('MapControls', () => {
  // Mock store setup
  const mockStore = configureStore({
    reducer: {
      map: (state = { currentState: { zoom: 10, drawMode: DrawMode.NONE } }) => state,
    },
  });

  // Mock functions from useMap hook
  const mockSetZoom = jest.fn();
  const mockSetDrawMode = jest.fn();
  const mockSetPan = jest.fn();
  const mockGetMapState = jest.fn(() => ({
    zoom: 10,
    drawMode: DrawMode.NONE,
  }));

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup useMap mock implementation
    (useMap as jest.Mock).mockReturnValue({
      setZoom: mockSetZoom,
      setDrawMode: mockSetDrawMode,
      setPan: mockSetPan,
      getMapState: mockGetMapState,
    });
  });

  describe('Rendering', () => {
    it('should render without accessibility violations', async () => {
      const { container } = render(
        <Provider store={mockStore}>
          <MapControls />
        </Provider>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should render all control buttons with correct ARIA labels', () => {
      render(
        <Provider store={mockStore}>
          <MapControls />
        </Provider>
      );

      expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /start drawing/i })).toBeInTheDocument();
    });

    it('should apply custom class name when provided', () => {
      const customClass = 'custom-controls';
      render(
        <Provider store={mockStore}>
          <MapControls className={customClass} />
        </Provider>
      );

      expect(screen.getByRole('group')).toHaveClass(`map-controls ${customClass}`);
    });
  });

  describe('Zoom Controls', () => {
    it('should handle zoom in click', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={mockStore}>
          <MapControls />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /zoom in/i }));
      
      await waitFor(() => {
        expect(mockSetZoom).toHaveBeenCalledWith(11, {
          animate: true,
          duration: 300,
          announceChange: true,
        });
      });
    });

    it('should handle zoom out click', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={mockStore}>
          <MapControls />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /zoom out/i }));
      
      await waitFor(() => {
        expect(mockSetZoom).toHaveBeenCalledWith(9, {
          animate: true,
          duration: 300,
          announceChange: true,
        });
      });
    });

    it('should disable zoom controls when offline', () => {
      render(
        <Provider store={mockStore}>
          <MapControls isOffline={true} />
        </Provider>
      );

      expect(screen.getByRole('button', { name: /zoom in/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /zoom out/i })).toBeDisabled();
    });

    it('should handle keyboard zoom controls', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={mockStore}>
          <MapControls />
        </Provider>
      );

      const zoomInButton = screen.getByRole('button', { name: /zoom in/i });
      await user.tab();
      expect(zoomInButton).toHaveFocus();
      await user.keyboard('{Enter}');
      
      await waitFor(() => {
        expect(mockSetZoom).toHaveBeenCalled();
      });
    });
  });

  describe('Drawing Tools', () => {
    it('should toggle drawing mode on button click', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={mockStore}>
          <MapControls />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /start drawing/i }));
      
      await waitFor(() => {
        expect(mockSetDrawMode).toHaveBeenCalledWith(DrawMode.DRAW_POLYGON, {
          updateCursor: true,
          announceChange: true,
        });
      });
    });

    it('should update drawing button state based on current mode', () => {
      mockGetMapState.mockReturnValue({
        zoom: 10,
        drawMode: DrawMode.DRAW_POLYGON,
      });

      render(
        <Provider store={mockStore}>
          <MapControls />
        </Provider>
      );

      expect(screen.getByRole('button', { name: /stop drawing/i })).toBeInTheDocument();
    });

    it('should disable drawing tools when offline', () => {
      render(
        <Provider store={mockStore}>
          <MapControls isOffline={true} />
        </Provider>
      );

      expect(screen.getByRole('button', { name: /start drawing/i })).toBeDisabled();
    });
  });

  describe('Touch Support', () => {
    it('should render larger touch targets when touchEnabled is true', () => {
      render(
        <Provider store={mockStore}>
          <MapControls touchEnabled={true} />
        </Provider>
      );

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveStyle({
          minWidth: '48px',
          minHeight: '48px',
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle zoom errors gracefully', async () => {
      const user = userEvent.setup();
      mockSetZoom.mockRejectedValueOnce(new Error('Zoom failed'));
      
      render(
        <Provider store={mockStore}>
          <MapControls />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /zoom in/i }));
      
      await waitFor(() => {
        expect(mockSetZoom).toHaveBeenCalled();
      });
      // Component should not crash and remain interactive
      expect(screen.getByRole('button', { name: /zoom in/i })).toBeEnabled();
    });

    it('should handle drawing mode errors gracefully', async () => {
      const user = userEvent.setup();
      mockSetDrawMode.mockRejectedValueOnce(new Error('Drawing mode failed'));
      
      render(
        <Provider store={mockStore}>
          <MapControls />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /start drawing/i }));
      
      await waitFor(() => {
        expect(mockSetDrawMode).toHaveBeenCalled();
      });
      // Component should not crash and remain interactive
      expect(screen.getByRole('button', { name: /start drawing/i })).toBeEnabled();
    });
  });
});