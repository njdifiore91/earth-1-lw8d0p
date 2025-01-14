import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { testUtils } from '@testing-library/react-hooks';

import Results from './Results';
import { SearchResult, SearchStatus } from '../../types/search.types';

// Mock WebSocket
const mockWebSocket = {
  connect: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Mock store setup
const createMockStore = (initialState = {}) => ({
  getState: () => ({
    search: {
      results: [],
      status: 'IDLE',
      error: null,
      ...initialState,
    },
  }),
  dispatch: vi.fn(),
  subscribe: vi.fn(),
});

// Mock search results data
const mockSearchResults: SearchResult[] = [
  {
    id: '1',
    timestamp: '2023-08-01T10:00:00Z',
    location: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: {},
    },
    confidence: 0.95,
    recommendations: [],
    metadata: {
      assetId: 'ENVIRONMENTAL_MONITORING',
      collectionTime: '2023-08-01T10:00:00Z',
      processingLevel: 'standard',
      resolution: 10,
      costEstimate: 1000,
      dataQuality: 0.95,
    },
    validation: {
      isValid: true,
      confidence: 0.95,
      qualityScore: 0.95,
      validationErrors: [],
      lastValidated: '2023-08-01T10:00:00Z',
    },
    performance: {
      processingTime: 100,
      coveragePercentage: 95,
      matchAccuracy: 0.95,
      optimizationScore: 0.95,
    },
  },
];

// Helper function to render component with providers
const renderWithProviders = (
  ui: React.ReactElement,
  {
    initialState = {},
    store = createMockStore(initialState),
    ...renderOptions
  } = {}
) => {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Provider store={store}>
      <BrowserRouter>{children}</BrowserRouter>
    </Provider>
  );

  return {
    store,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
};

describe('Results Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock WebSocket global
    global.WebSocket = vi.fn(() => mockWebSocket) as any;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state correctly', () => {
    const { store } = renderWithProviders(
      <Results searchId="test-search" />,
      {
        initialState: {
          search: {
            status: 'IN_PROGRESS',
            results: [],
          },
        },
      }
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();
    expect(store.getState().search.status).toBe('IN_PROGRESS');
  });

  it('handles empty state appropriately', () => {
    renderWithProviders(
      <Results searchId="test-search" />,
      {
        initialState: {
          search: {
            status: 'COMPLETED',
            results: [],
          },
        },
      }
    );

    expect(screen.getByText(/no results/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });

  it('displays capability matrix correctly', async () => {
    const { store } = renderWithProviders(
      <Results searchId="test-search" />,
      {
        initialState: {
          search: {
            status: 'COMPLETED',
            results: mockSearchResults,
          },
        },
      }
    );

    await waitFor(() => {
      const matrix = screen.getByRole('grid', { name: /capability/i });
      expect(matrix).toBeInTheDocument();
      
      // Check confidence scores
      const confidenceCell = within(matrix).getByText('95%');
      expect(confidenceCell).toBeInTheDocument();
    });
  });

  it('handles WebSocket updates correctly', async () => {
    const { store } = renderWithProviders(
      <Results searchId="test-search" />,
      {
        initialState: {
          search: {
            status: 'IN_PROGRESS',
            results: [],
          },
        },
      }
    );

    // Simulate WebSocket connection
    await waitFor(() => {
      expect(mockWebSocket.addEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      );
    });

    // Simulate WebSocket message
    const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
      call => call[0] === 'message'
    )[1];

    messageHandler({
      data: JSON.stringify({
        type: 'search_update',
        payload: mockSearchResults[0],
      }),
    });

    await waitFor(() => {
      expect(store.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: expect.stringContaining('setSearchResults'),
        })
      );
    });
  });

  it('handles export functionality correctly', async () => {
    const onError = vi.fn();
    const { store } = renderWithProviders(
      <Results searchId="test-search" onError={onError} />,
      {
        initialState: {
          search: {
            status: 'COMPLETED',
            results: mockSearchResults,
          },
        },
      }
    );

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    expect(exportButton).not.toBeDisabled();
    // Verify export action was dispatched
    expect(store.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.stringContaining('export'),
      })
    );
  });

  it('handles error states appropriately', async () => {
    const onError = vi.fn();
    renderWithProviders(
      <Results searchId="test-search" onError={onError} />,
      {
        initialState: {
          search: {
            status: 'FAILED',
            error: 'Test error message',
            results: [],
          },
        },
      }
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/error/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(onError).toHaveBeenCalled();
  });

  it('supports keyboard navigation in results grid', async () => {
    renderWithProviders(
      <Results searchId="test-search" />,
      {
        initialState: {
          search: {
            status: 'COMPLETED',
            results: mockSearchResults,
          },
        },
      }
    );

    const grid = screen.getByRole('grid');
    await userEvent.tab();
    expect(grid).toHaveFocus();

    // Test arrow key navigation
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Enter}');
    
    expect(screen.getByRole('gridcell', { selected: true })).toBeInTheDocument();
  });

  it('maintains WebSocket connection and handles reconnection', async () => {
    const { rerender } = renderWithProviders(
      <Results searchId="test-search" />,
      {
        initialState: {
          search: {
            status: 'IN_PROGRESS',
            results: [],
          },
        },
      }
    );

    // Simulate WebSocket disconnection
    const closeHandler = mockWebSocket.addEventListener.mock.calls.find(
      call => call[0] === 'close'
    )[1];
    closeHandler();

    // Verify reconnection attempt
    await waitFor(() => {
      expect(mockWebSocket.connect).toHaveBeenCalled();
    });

    // Verify cleanup on unmount
    rerender(<div />);
    expect(mockWebSocket.close).toHaveBeenCalled();
  });
});