import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import axe from '@axe-core/react';
import { createMockStore } from '@testing-library/react-hooks';

// Component under test
import Search from './Search';

// Mocks
import useSearch from '../../hooks/useSearch';
import SearchService from '../../services/search.service';

// Mock implementations
vi.mock('../../hooks/useSearch');
vi.mock('../../services/search.service');

// Helper function to render component with required providers
const renderWithProviders = (
  ui: React.ReactElement,
  {
    initialState = {},
    store = createMockStore({ initialState }),
    ...renderOptions
  } = {}
) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter>
        {children}
      </MemoryRouter>
    </Provider>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

// Mock data generator
const createMockSearchData = (overrides = {}) => ({
  location: {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [-74.5, 40]
    },
    properties: {}
  },
  assetType: 'ENVIRONMENTAL_MONITORING',
  requirements: {
    minimumSize: 10,
    detectionLimit: 0.5,
    adjacentRecommendations: false,
    customParameters: {}
  },
  ...overrides
});

describe('Search Page', () => {
  let mockStore: any;
  let mockSearchHook: any;

  beforeEach(() => {
    mockStore = createMockStore({
      search: {
        parameters: null,
        results: [],
        status: 'IDLE',
        error: null,
        loading: {
          parameters: false,
          results: false
        }
      }
    });

    mockSearchHook = {
      createSearch: vi.fn(),
      loading: { isCreating: false },
      error: null,
      progress: 0,
      currentSearch: { parameters: null }
    };

    (useSearch as jest.Mock).mockReturnValue(mockSearchHook);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render without errors', () => {
    renderWithProviders(<Search />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByRole('form')).toBeInTheDocument();
  });

  it('should pass accessibility audit', async () => {
    const { container } = renderWithProviders(<Search />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should handle form submission correctly', async () => {
    const mockSearchData = createMockSearchData();
    renderWithProviders(<Search />);

    // Fill location
    const locationInput = screen.getByLabelText(/location/i);
    fireEvent.change(locationInput, { target: { value: JSON.stringify(mockSearchData.location) } });

    // Select asset type
    const assetSelect = screen.getByLabelText(/asset type/i);
    fireEvent.change(assetSelect, { target: { value: mockSearchData.assetType } });

    // Fill requirements
    const minimumSizeInput = screen.getByLabelText(/minimum size/i);
    fireEvent.change(minimumSizeInput, { target: { value: mockSearchData.requirements.minimumSize } });

    // Submit form
    const submitButton = screen.getByRole('button', { name: /search/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockSearchHook.createSearch).toHaveBeenCalledWith(mockSearchData);
    });
  });

  it('should display loading state during search', async () => {
    mockSearchHook.loading.isCreating = true;
    renderWithProviders(<Search />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByLabelText(/processing search/i)).toBeInTheDocument();
  });

  it('should handle and display errors correctly', async () => {
    const errorMessage = 'Search failed';
    mockSearchHook.error = { message: errorMessage };
    renderWithProviders(<Search />);

    expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
  });

  it('should update map when location is selected', async () => {
    const mockLocation = createMockSearchData().location;
    renderWithProviders(<Search initialLocation={mockLocation} />);

    const mapContainer = screen.getByTestId('map-container');
    await waitFor(() => {
      expect(mapContainer).toHaveAttribute('data-center', JSON.stringify(mockLocation.geometry.coordinates));
    });
  });

  it('should handle real-time updates correctly', async () => {
    const mockProgress = 50;
    mockSearchHook.progress = mockProgress;
    renderWithProviders(<Search />);

    const progressIndicator = screen.getByRole('progressbar');
    expect(progressIndicator).toHaveAttribute('aria-valuenow', String(mockProgress));
  });

  it('should validate form inputs before submission', async () => {
    renderWithProviders(<Search />);

    // Try to submit without required fields
    const submitButton = screen.getByRole('button', { name: /search/i });
    fireEvent.click(submitButton);

    // Check for validation messages
    expect(screen.getByText(/location is required/i)).toBeInTheDocument();
    expect(screen.getByText(/asset type is required/i)).toBeInTheDocument();
  });

  it('should handle keyboard navigation correctly', () => {
    renderWithProviders(<Search />);

    const form = screen.getByRole('form');
    const firstInput = screen.getByLabelText(/location/i);
    
    // Start from first input
    firstInput.focus();
    
    // Tab through form elements
    fireEvent.keyDown(form, { key: 'Tab' });
    expect(screen.getByLabelText(/asset type/i)).toHaveFocus();
  });

  it('should cleanup resources on unmount', () => {
    const { unmount } = renderWithProviders(<Search />);
    const cleanup = vi.fn();
    vi.spyOn(React, 'useEffect').mockImplementation((f) => f()?.());
    
    unmount();
    
    expect(cleanup).toHaveBeenCalled();
  });

  it('should handle map interaction events', async () => {
    const onFeatureClick = vi.fn();
    renderWithProviders(<Search />);

    const mapContainer = screen.getByTestId('map-container');
    fireEvent.click(mapContainer, { clientX: 100, clientY: 100 });

    await waitFor(() => {
      expect(onFeatureClick).toHaveBeenCalled();
    });
  });
});