import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { vi } from 'vitest';
import LocationInput from './LocationInput';
import { validateLocation, validateFileUpload } from '../../../utils/validation.utils';
import { LOCATION_VALIDATION, FILE_VALIDATION } from '../../../constants/validation.constants';

// Mock mapbox-gl since it's not available in test environment
vi.mock('mapbox-gl', () => ({
  Map: vi.fn(() => ({
    addControl: vi.fn(),
    remove: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  })),
  NavigationControl: vi.fn(),
  KeyboardHandler: vi.fn()
}));

// Mock Redux store
const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      search: (state = initialState, action) => state
    }
  });
};

// Helper function to render component with Redux store
const renderWithRedux = (component: React.ReactElement, initialState = {}) => {
  const store = createMockStore(initialState);
  return {
    ...render(
      <Provider store={store}>
        {component}
      </Provider>
    ),
    store
  };
};

// Mock file creation helper
const createMockFile = (content: string, type: string): File => {
  const blob = new Blob([content], { type });
  return new File([blob], 'test.kml', { type });
};

describe('LocationInput Component', () => {
  const mockOnLocationChange = vi.fn();
  const defaultProps = {
    onLocationChange: mockOnLocationChange,
    isAccessible: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering and Accessibility', () => {
    test('renders all input methods with proper accessibility attributes', () => {
      renderWithRedux(<LocationInput {...defaultProps} />);

      // Check radio group accessibility
      const radioGroup = screen.getByRole('radiogroup', { name: /location input method/i });
      expect(radioGroup).toBeInTheDocument();

      // Verify all input methods are present
      const options = ['Draw on map', 'Upload KML file', 'Enter coordinates'];
      options.forEach(option => {
        const radio = screen.getByRole('radio', { name: option });
        expect(radio).toBeInTheDocument();
        expect(radio).toHaveAttribute('aria-describedby');
      });

      // Check ARIA live region
      const liveRegion = screen.getByRole('region', { name: /location input/i });
      expect(liveRegion).toBeInTheDocument();
      expect(liveRegion).toContainElement(screen.getByRole('status', { hidden: true }));
    });

    test('handles keyboard navigation correctly', async () => {
      renderWithRedux(<LocationInput {...defaultProps} />);
      const user = userEvent.setup();

      // Tab through radio options
      await user.tab();
      expect(screen.getByRole('radio', { name: /draw on map/i })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('radio', { name: /upload kml file/i })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('radio', { name: /enter coordinates/i })).toHaveFocus();
    });
  });

  describe('Map Drawing Mode', () => {
    test('initializes map with accessibility controls when isAccessible is true', () => {
      renderWithRedux(<LocationInput {...defaultProps} />);

      const mapContainer = screen.getByRole('application', { name: /interactive map/i });
      expect(mapContainer).toBeInTheDocument();
    });

    test('handles map interaction errors gracefully', async () => {
      renderWithRedux(<LocationInput {...defaultProps} />);

      // Simulate map error
      const errorEvent = new Event('error');
      fireEvent(screen.getByRole('application'), errorEvent);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('File Upload Mode', () => {
    test('processes valid KML files correctly', async () => {
      renderWithRedux(<LocationInput {...defaultProps} />);
      const user = userEvent.setup();

      // Select upload mode
      await user.click(screen.getByRole('radio', { name: /upload kml file/i }));

      // Create and upload valid KML file
      const validKML = '<kml><Placemark><Polygon><coordinates>-122.4,37.8</coordinates></Polygon></Placemark></kml>';
      const file = createMockFile(validKML, 'application/vnd.google-earth.kml+xml');

      const input = screen.getByLabelText(/upload kml or kmz file/i);
      await user.upload(input, file);

      await waitFor(() => {
        expect(mockOnLocationChange).toHaveBeenCalled();
        expect(screen.getByText(/file uploaded successfully/i)).toBeInTheDocument();
      });
    });

    test('handles invalid files appropriately', async () => {
      renderWithRedux(<LocationInput {...defaultProps} />);
      const user = userEvent.setup();

      await user.click(screen.getByRole('radio', { name: /upload kml file/i }));

      // Test file size validation
      const largeFile = createMockFile('x'.repeat(FILE_VALIDATION.MAX_KML_SIZE + 1), 'application/vnd.google-earth.kml+xml');
      const input = screen.getByLabelText(/upload kml or kmz file/i);
      await user.upload(input, largeFile);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/file size exceeds maximum limit/i);
      });

      // Test invalid file type
      const invalidFile = createMockFile('invalid content', 'text/plain');
      await user.upload(input, invalidFile);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/invalid file type/i);
      });
    });
  });

  describe('Coordinate Input Mode', () => {
    test('validates coordinate input with proper feedback', async () => {
      renderWithRedux(<LocationInput {...defaultProps} />);
      const user = userEvent.setup();

      // Select coordinate input mode
      await user.click(screen.getByRole('radio', { name: /enter coordinates/i }));

      // Test valid coordinates
      await user.type(screen.getByLabelText(/latitude/i), '45.5231');
      await user.type(screen.getByLabelText(/longitude/i), '-122.6765');

      await waitFor(() => {
        expect(mockOnLocationChange).toHaveBeenCalledWith(expect.objectContaining({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-122.6765, 45.5231]
          }
        }));
      });

      // Test invalid coordinates
      await user.clear(screen.getByLabelText(/latitude/i));
      await user.type(screen.getByLabelText(/latitude/i), '95');

      await waitFor(() => {
        expect(screen.getByText(/latitude must be between -90 and 90/i)).toBeInTheDocument();
      });
    });

    test('handles coordinate input edge cases', async () => {
      renderWithRedux(<LocationInput {...defaultProps} />);
      const user = userEvent.setup();

      await user.click(screen.getByRole('radio', { name: /enter coordinates/i }));

      // Test non-numeric input
      await user.type(screen.getByLabelText(/latitude/i), 'abc');
      expect(screen.getByText(/invalid latitude value/i)).toBeInTheDocument();

      // Test boundary values
      await user.clear(screen.getByLabelText(/latitude/i));
      await user.type(screen.getByLabelText(/latitude/i), '90');
      await user.type(screen.getByLabelText(/longitude/i), '180');

      await waitFor(() => {
        expect(mockOnLocationChange).toHaveBeenCalled();
      });
    });
  });

  describe('Redux Integration', () => {
    test('updates Redux store on valid location input', async () => {
      const store = createMockStore({
        search: { parameters: null }
      });

      render(
        <Provider store={store}>
          <LocationInput {...defaultProps} />
        </Provider>
      );

      const user = userEvent.setup();

      // Enter valid coordinates
      await user.click(screen.getByRole('radio', { name: /enter coordinates/i }));
      await user.type(screen.getByLabelText(/latitude/i), '45.5231');
      await user.type(screen.getByLabelText(/longitude/i), '-122.6765');

      await waitFor(() => {
        const state = store.getState();
        expect(state.search.parameters).toBeDefined();
      });
    });
  });
});