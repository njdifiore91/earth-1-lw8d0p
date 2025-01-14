// @version react@18.2.x
import React from 'react';
// @version @testing-library/react@13.x
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
// @version @testing-library/user-event@14.x
import { userEvent } from '@testing-library/user-event';
// @version @jest/globals@29.x
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
// @version react-redux@8.x
import { Provider } from 'react-redux';
// @version @axe-core/react@4.x
import { axe, toHaveNoViolations } from '@axe-core/react';

import DrawTools from './DrawTools';
import { DrawMode } from '../../../types/map.types';
import { useMap } from '../../../hooks/useMap';
import { INTERACTION_SETTINGS } from '../../../constants/map.constants';

// Add accessibility matchers
expect.extend(toHaveNoViolations);

// Mock useMap hook
jest.mock('../../../hooks/useMap', () => ({
  useMap: jest.fn()
}));

// Mock performance observer
const mockPerformanceObserver = jest.fn();
window.PerformanceObserver = mockPerformanceObserver;

/**
 * Helper function to render component with Redux store and accessibility testing
 */
const renderWithRedux = (component: JSX.Element, initialState = {}) => {
  const mockStore = {
    getState: () => initialState,
    subscribe: jest.fn(),
    dispatch: jest.fn(),
  };

  return {
    ...render(
      <Provider store={mockStore}>
        {component}
      </Provider>
    ),
    store: mockStore
  };
};

/**
 * Helper function to setup performance measurement
 */
const setupPerformanceTest = () => {
  const performanceEntries: PerformanceEntry[] = [];
  const observe = jest.fn();
  const disconnect = jest.fn();

  mockPerformanceObserver.mockImplementation((callback) => ({
    observe,
    disconnect,
    takeRecords: () => performanceEntries
  }));

  return { observe, disconnect, performanceEntries };
};

describe('DrawTools Component', () => {
  let mockSetDrawMode: jest.Mock;
  let mockOnDrawComplete: jest.Mock;
  let mockOnDrawCancel: jest.Mock;
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSetDrawMode = jest.fn();
    mockOnDrawComplete = jest.fn();
    mockOnDrawCancel = jest.fn();
    user = userEvent.setup();

    (useMap as jest.Mock).mockReturnValue({
      setDrawMode: mockSetDrawMode,
      mapState: {
        isDrawing: false,
        drawMode: DrawMode.NONE
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering and Accessibility', () => {
    it('should render all drawing tools with correct ARIA labels', () => {
      renderWithRedux(
        <DrawTools
          onDrawComplete={mockOnDrawComplete}
          onDrawCancel={mockOnDrawCancel}
        />
      );

      expect(screen.getByRole('toolbar')).toBeInTheDocument();
      expect(screen.getByLabelText('Draw Polygon')).toBeInTheDocument();
      expect(screen.getByLabelText('Draw Line')).toBeInTheDocument();
      expect(screen.getByLabelText('Place Point')).toBeInTheDocument();
    });

    it('should have no accessibility violations', async () => {
      const { container } = renderWithRedux(
        <DrawTools
          onDrawComplete={mockOnDrawComplete}
          onDrawCancel={mockOnDrawCancel}
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should show tooltips on hover', async () => {
      renderWithRedux(
        <DrawTools
          onDrawComplete={mockOnDrawComplete}
          onDrawCancel={mockOnDrawCancel}
        />
      );

      await user.hover(screen.getByLabelText('Draw Polygon'));
      expect(await screen.findByText('Draw Polygon (P)')).toBeInTheDocument();
    });

    it('should handle disabled state correctly', () => {
      renderWithRedux(
        <DrawTools
          onDrawComplete={mockOnDrawComplete}
          onDrawCancel={mockOnDrawCancel}
          disabled={true}
        />
      );

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('User Interactions', () => {
    it('should handle polygon drawing mode selection', async () => {
      renderWithRedux(
        <DrawTools
          onDrawComplete={mockOnDrawComplete}
          onDrawCancel={mockOnDrawCancel}
        />
      );

      await user.click(screen.getByLabelText('Draw Polygon'));
      expect(mockSetDrawMode).toHaveBeenCalledWith(DrawMode.DRAW_POLYGON);
    });

    it('should handle keyboard shortcuts', async () => {
      renderWithRedux(
        <DrawTools
          onDrawComplete={mockOnDrawComplete}
          onDrawCancel={mockOnDrawCancel}
        />
      );

      fireEvent.keyDown(document, { key: 'p' });
      expect(mockSetDrawMode).toHaveBeenCalledWith(DrawMode.DRAW_POLYGON);

      fireEvent.keyDown(document, { key: 'l' });
      expect(mockSetDrawMode).toHaveBeenCalledWith(DrawMode.DRAW_LINE);

      fireEvent.keyDown(document, { key: 'm' });
      expect(mockSetDrawMode).toHaveBeenCalledWith(DrawMode.DRAW_POINT);
    });

    it('should handle drawing cancellation', async () => {
      (useMap as jest.Mock).mockReturnValue({
        setDrawMode: mockSetDrawMode,
        mapState: {
          isDrawing: true,
          drawMode: DrawMode.DRAW_POLYGON
        }
      });

      renderWithRedux(
        <DrawTools
          onDrawComplete={mockOnDrawComplete}
          onDrawCancel={mockOnDrawCancel}
        />
      );

      const cancelButton = screen.getByLabelText('Cancel Drawing');
      await user.click(cancelButton);
      expect(mockOnDrawCancel).toHaveBeenCalled();
      expect(mockSetDrawMode).toHaveBeenCalledWith(DrawMode.NONE);
    });

    it('should handle touch events correctly', async () => {
      renderWithRedux(
        <DrawTools
          onDrawComplete={mockOnDrawComplete}
          onDrawCancel={mockOnDrawCancel}
        />
      );

      const polygonButton = screen.getByLabelText('Draw Polygon');
      fireEvent.touchStart(polygonButton);
      fireEvent.touchEnd(polygonButton);

      expect(mockSetDrawMode).toHaveBeenCalledWith(DrawMode.DRAW_POLYGON);
    });
  });

  describe('Performance', () => {
    it('should render efficiently without unnecessary updates', async () => {
      const { observe, disconnect } = setupPerformanceTest();

      const { rerender } = renderWithRedux(
        <DrawTools
          onDrawComplete={mockOnDrawComplete}
          onDrawCancel={mockOnDrawCancel}
        />
      );

      expect(observe).toHaveBeenCalled();

      // Rerender with same props
      rerender(
        <DrawTools
          onDrawComplete={mockOnDrawComplete}
          onDrawCancel={mockOnDrawCancel}
        />
      );

      expect(mockPerformanceObserver).toHaveBeenCalledTimes(1);
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('should cleanup event listeners on unmount', () => {
      const { unmount } = renderWithRedux(
        <DrawTools
          onDrawComplete={mockOnDrawComplete}
          onDrawCancel={mockOnDrawCancel}
        />
      );

      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      unmount();
      expect(removeEventListenerSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when draw completion fails', async () => {
      mockOnDrawComplete.mockRejectedValue(new Error('Draw completion failed'));

      (useMap as jest.Mock).mockReturnValue({
        setDrawMode: mockSetDrawMode,
        mapState: {
          isDrawing: true,
          drawMode: DrawMode.DRAW_POLYGON
        }
      });

      renderWithRedux(
        <DrawTools
          onDrawComplete={mockOnDrawComplete}
          onDrawCancel={mockOnDrawCancel}
        />
      );

      fireEvent.keyDown(document, { key: 'Enter' });
      
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to process drawing');
      });
    });

    it('should handle invalid prop combinations gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      renderWithRedux(
        <DrawTools
          onDrawComplete={mockOnDrawComplete}
          onDrawCancel={mockOnDrawCancel}
          maxPoints={-1}
        />
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});