// External imports
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Internal imports
import { Dashboard } from './Dashboard';
import { useAuth } from '../../hooks/useAuth';
import { SearchService } from '../../services/search.service';

// Mock external dependencies
jest.mock('../../hooks/useAuth', () => ({
  useAuth: jest.fn()
}));

jest.mock('../../services/search.service', () => ({
  SearchService: jest.fn().mockImplementation(() => ({
    getRecentSearches: jest.fn(),
    subscribeToUpdates: jest.fn()
  }))
}));

// Mock store configuration
const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      ui: (state = { sidebarOpen: true }, action) => state,
      auth: (state = {}, action) => state
    },
    preloadedState: initialState
  });
};

// Test utilities
const renderWithProviders = (
  component: React.ReactElement,
  { initialState = {}, store = createMockStore(initialState) } = {}
) => {
  return {
    ...render(
      <Provider store={store}>
        {component}
      </Provider>
    ),
    store
  };
};

describe('Dashboard Component', () => {
  // Mock data
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'CUSTOMER'
  };

  const mockSearches = [
    {
      id: 'search-1',
      name: 'Environmental Search',
      status: 'completed',
      lastUpdated: new Date('2024-01-01'),
      location: 'North America',
      progress: 100
    },
    {
      id: 'search-2',
      name: 'Infrastructure Analysis',
      status: 'in_progress',
      lastUpdated: new Date('2024-01-02'),
      location: 'Europe',
      progress: 75
    }
  ];

  const mockActivities = [
    {
      id: 'activity-1',
      timestamp: new Date('2024-01-01'),
      type: 'search',
      description: 'Search created for North America',
      status: 'success'
    }
  ];

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup auth mock
    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      isAuthenticated: true
    });

    // Setup SearchService mock
    const searchServiceMock = new SearchService();
    (searchServiceMock.getRecentSearches as jest.Mock).mockResolvedValue(mockSearches);
  });

  it('renders authenticated dashboard correctly', async () => {
    renderWithProviders(<Dashboard />);

    // Verify main sections are present
    expect(screen.getByText('Recent Searches')).toBeInTheDocument();
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();

    // Wait for search data to load
    await waitFor(() => {
      expect(screen.getByText('Environmental Search')).toBeInTheDocument();
      expect(screen.getByText('Infrastructure Analysis')).toBeInTheDocument();
    });

    // Verify search details are displayed
    const searchItems = screen.getAllByRole('listitem');
    expect(searchItems.length).toBeGreaterThan(0);
  });

  it('handles loading states correctly', async () => {
    renderWithProviders(<Dashboard />);

    // Verify loading skeletons are shown initially
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);

    // Wait for content to load
    await waitFor(() => {
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    });
  });

  it('displays search progress indicators correctly', async () => {
    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      // Check progress indicator for in-progress search
      const progressIndicator = screen.getByText('75% Complete');
      expect(progressIndicator).toBeInTheDocument();
    });
  });

  it('handles search history updates', async () => {
    const searchService = new SearchService();
    const updateCallback = jest.fn();
    (searchService.subscribeToUpdates as jest.Mock).mockImplementation((id, callback) => {
      updateCallback.mockImplementation(callback);
      return () => {};
    });

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(searchService.subscribeToUpdates).toHaveBeenCalled();
    });

    // Simulate search update
    const updatedSearch = {
      ...mockSearches[1],
      progress: 85
    };
    updateCallback({ results: [updatedSearch] });

    await waitFor(() => {
      expect(screen.getByText('85% Complete')).toBeInTheDocument();
    });
  });

  it('handles error states gracefully', async () => {
    const searchService = new SearchService();
    (searchService.getRecentSearches as jest.Mock).mockRejectedValue(new Error('Failed to fetch'));

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  it('updates recent activity feed', async () => {
    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Search created for North America')).toBeInTheDocument();
    });

    // Verify activity timestamp
    const timestamp = screen.getByText(new Date('2024-01-01').toLocaleString());
    expect(timestamp).toBeInTheDocument();
  });

  it('handles responsive layout', async () => {
    // Mock mobile viewport
    window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: query === '(max-width: 768px)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn()
    }));

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      // Verify mobile-specific layout adjustments
      const container = screen.getByTestId('dashboard-container');
      expect(container).toHaveStyle({ padding: '16px' });
    });
  });

  it('cleans up subscriptions on unmount', async () => {
    const searchService = new SearchService();
    const unsubscribeMock = jest.fn();
    (searchService.subscribeToUpdates as jest.Mock).mockReturnValue(unsubscribeMock);

    const { unmount } = renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(searchService.subscribeToUpdates).toHaveBeenCalled();
    });

    unmount();
    expect(unsubscribeMock).toHaveBeenCalled();
  });
});