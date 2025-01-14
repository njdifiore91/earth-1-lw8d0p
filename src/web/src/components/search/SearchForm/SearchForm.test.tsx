import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import SearchForm from './SearchForm';
import { SearchParameters } from '../../../types/search.types';
import { useSearch } from '../../../hooks/useSearch';

// Mock dependencies
vi.mock('../../../hooks/useSearch');

// Mock store setup
const mockStore = configureStore({
  reducer: {
    search: (state = {}, action) => state
  }
});

// Mock search parameters
const mockSearchParameters: SearchParameters = {
  location: {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
    },
    properties: {}
  },
  timeWindow: {
    start: '2023-01-01T00:00:00Z',
    end: '2023-01-31T23:59:59Z'
  },
  assetType: 'ENVIRONMENTAL_MONITORING',
  requirements: {
    minimumSize: 10,
    detectionLimit: 0.5,
    adjacentRecommendations: false,
    customParameters: {},
    constraints: [],
    priority: 'MEDIUM'
  },
  validationRules: {
    minConfidence: 0.7,
    maxAreaSize: 1000000,
    requiredFields: ['location', 'timeWindow', 'assetType'],
    customValidators: {}
  }
};

// Test utilities
const renderWithProvider = (ui: React.ReactElement) => {
  return render(
    <Provider store={mockStore}>
      {ui}
    </Provider>
  );
};

describe('SearchForm', () => {
  let user: ReturnType<typeof userEvent.setup>;
  const mockOnSubmit = vi.fn();
  const mockOnError = vi.fn();
  const mockCreateSearch = vi.fn();
  const mockValidateLocation = vi.fn();
  const mockValidateAsset = vi.fn();

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
    
    // Mock useSearch hook implementation
    (useSearch as jest.Mock).mockReturnValue({
      createSearch: mockCreateSearch,
      validateLocation: mockValidateLocation,
      validateAsset: mockValidateAsset
    });
  });

  describe('Form Rendering', () => {
    it('should render all form steps with proper accessibility attributes', () => {
      renderWithProvider(
        <SearchForm 
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      );

      // Verify stepper presence
      const stepper = screen.getByRole('group', { name: /search steps/i });
      expect(stepper).toBeInTheDocument();

      // Verify step labels
      expect(screen.getByText('Location')).toBeInTheDocument();
      expect(screen.getByText('Asset Type')).toBeInTheDocument();
      expect(screen.getByText('Requirements')).toBeInTheDocument();

      // Verify navigation buttons
      expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
    });

    it('should handle keyboard navigation correctly', async () => {
      renderWithProvider(
        <SearchForm 
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      );

      // Test tab navigation
      await user.tab();
      expect(screen.getByRole('button', { name: /next/i })).toHaveFocus();
    });
  });

  describe('Location Step', () => {
    it('should validate location input correctly', async () => {
      renderWithProvider(
        <SearchForm 
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      );

      // Mock valid location selection
      mockValidateLocation.mockResolvedValueOnce(true);
      
      // Simulate map interaction
      const mapContainer = screen.getByRole('region', { name: /location input/i });
      fireEvent.click(mapContainer);

      await waitFor(() => {
        expect(mockValidateLocation).toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
      });
    });

    it('should handle KML file upload', async () => {
      renderWithProvider(
        <SearchForm 
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      );

      const file = new File(['kml content'], 'test.kml', { type: 'application/vnd.google-earth.kml+xml' });
      const fileInput = screen.getByLabelText(/upload kml/i);

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(mockValidateLocation).toHaveBeenCalled();
      });
    });
  });

  describe('Asset Step', () => {
    it('should validate asset type selection', async () => {
      renderWithProvider(
        <SearchForm 
          onSubmit={mockOnSubmit}
          onError={mockOnError}
          initialValues={mockSearchParameters}
        />
      );

      // Navigate to asset step
      await user.click(screen.getByRole('button', { name: /next/i }));

      const assetSelect = screen.getByRole('combobox', { name: /asset type/i });
      await user.selectOptions(assetSelect, 'ENVIRONMENTAL_MONITORING');

      await waitFor(() => {
        expect(mockValidateAsset).toHaveBeenCalledWith('ENVIRONMENTAL_MONITORING');
      });
    });

    it('should show validation errors for invalid asset selection', async () => {
      mockValidateAsset.mockRejectedValueOnce(new Error('Invalid asset type'));
      
      renderWithProvider(
        <SearchForm 
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      );

      // Navigate to asset step
      await user.click(screen.getByRole('button', { name: /next/i }));

      const assetSelect = screen.getByRole('combobox', { name: /asset type/i });
      await user.selectOptions(assetSelect, 'INVALID_TYPE');

      await waitFor(() => {
        expect(screen.getByText(/invalid asset type/i)).toBeInTheDocument();
      });
    });
  });

  describe('Requirements Step', () => {
    it('should handle requirements form submission', async () => {
      renderWithProvider(
        <SearchForm 
          onSubmit={mockOnSubmit}
          onError={mockOnError}
          initialValues={mockSearchParameters}
        />
      );

      // Navigate to requirements step
      await user.click(screen.getByRole('button', { name: /next/i }));
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Fill requirements form
      await user.type(screen.getByLabelText(/minimum size/i), '10');
      await user.type(screen.getByLabelText(/detection limit/i), '0.5');
      await user.click(screen.getByRole('checkbox', { name: /adjacent recommendations/i }));

      // Submit form
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({
          requirements: expect.objectContaining({
            minimumSize: 10,
            detectionLimit: 0.5,
            adjacentRecommendations: true
          })
        }));
      });
    });

    it('should validate requirements before submission', async () => {
      renderWithProvider(
        <SearchForm 
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      );

      // Navigate to requirements step
      await user.click(screen.getByRole('button', { name: /next/i }));
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Submit without filling required fields
      await user.click(screen.getByRole('button', { name: /submit/i }));

      await waitFor(() => {
        expect(screen.getByText(/required field/i)).toBeInTheDocument();
        expect(mockOnSubmit).not.toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error messages when validation fails', async () => {
      mockCreateSearch.mockRejectedValueOnce(new Error('Validation failed'));

      renderWithProvider(
        <SearchForm 
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/validation failed/i);
        expect(mockOnError).toHaveBeenCalled();
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading indicator during form submission', async () => {
      mockCreateSearch.mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 1000)));

      renderWithProvider(
        <SearchForm 
          onSubmit={mockOnSubmit}
          onError={mockOnError}
          initialValues={mockSearchParameters}
        />
      );

      await user.click(screen.getByRole('button', { name: /submit/i }));

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    });
  });
});