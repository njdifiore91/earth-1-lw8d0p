import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'; // v14.0.0
import userEvent from '@testing-library/user-event'; // v14.0.0
import { Provider } from 'react-redux'; // v8.0.5
import { configureStore } from '@reduxjs/toolkit'; // v1.9.5
import { axe } from '@axe-core/react'; // v4.7.3

// Internal imports
import ResultsGrid, { ResultsGridProps } from './ResultsGrid';
import { SearchResult, SearchStatus } from '../../../types/search.types';
import searchReducer from '../../../store/slices/searchSlice';

/**
 * Helper function to render component with Redux store
 */
const renderWithRedux = (
  component: JSX.Element,
  initialState = {}
) => {
  const store = configureStore({
    reducer: { search: searchReducer },
    preloadedState: { search: initialState }
  });

  const user = userEvent.setup();

  return {
    ...render(
      <Provider store={store}>
        {component}
      </Provider>
    ),
    store,
    user
  };
};

/**
 * Mock search result factory
 */
const createMockSearchResults = (count: number): SearchResult[] => {
  return Array.from({ length: count }, (_, index) => ({
    id: `result-${index + 1}`,
    timestamp: new Date(2024, 0, index + 1).toISOString(),
    location: {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [0, 0]
      },
      properties: {}
    },
    confidence: 0.75 + (index * 0.05),
    recommendations: [],
    metadata: {
      assetId: `ASSET-${index + 1}`,
      collectionTime: new Date().toISOString(),
      processingLevel: 'standard',
      resolution: 10,
      costEstimate: 1000 + (index * 100),
      dataQuality: 0.85
    },
    validation: {
      isValid: true,
      confidence: 0.85,
      qualityScore: 0.9,
      validationErrors: [],
      lastValidated: new Date().toISOString()
    },
    performance: {
      processingTime: 1000,
      coveragePercentage: 95,
      matchAccuracy: 0.88,
      optimizationScore: 0.92
    }
  }));
};

describe('ResultsGrid Component', () => {
  const mockOnResultSelect = jest.fn();
  const mockOnExport = jest.fn();
  const defaultProps: ResultsGridProps = {
    onResultSelect: mockOnResultSelect,
    onExport: mockOnExport
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state correctly', () => {
    const { store } = renderWithRedux(
      <ResultsGrid {...defaultProps} />,
      {
        status: 'IN_PROGRESS',
        results: [],
        loading: { results: true }
      }
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByLabelText('Search Results Grid')).toHaveAttribute('aria-busy', 'true');
  });

  it('should display search results with correct formatting', async () => {
    const mockResults = createMockSearchResults(3);
    const { store } = renderWithRedux(
      <ResultsGrid {...defaultProps} />,
      {
        status: 'COMPLETED',
        results: mockResults,
        loading: { results: false }
      }
    );

    // Verify column headers
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Confidence')).toBeInTheDocument();
    expect(screen.getByText('Asset Type')).toBeInTheDocument();

    // Verify data formatting
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(4); // Header + 3 results

    // Check confidence formatting
    const confidenceCells = screen.getAllByRole('cell', { name: /\d+\.\d+%/ });
    expect(confidenceCells[0]).toHaveTextContent('75.0%');

    // Check cost formatting
    const costCells = screen.getAllByRole('cell', { name: /\$\d+,\d+/ });
    expect(costCells[0]).toHaveTextContent('$1,000');
  });

  it('should handle sorting functionality', async () => {
    const mockResults = createMockSearchResults(5);
    const { user } = renderWithRedux(
      <ResultsGrid {...defaultProps} />,
      {
        status: 'COMPLETED',
        results: mockResults,
        loading: { results: false }
      }
    );

    // Click confidence column header to sort
    const confidenceHeader = screen.getByRole('columnheader', { name: /Confidence/i });
    await user.click(confidenceHeader);

    // Verify sort indicator
    expect(confidenceHeader).toHaveAttribute('aria-sort', 'descending');

    // Verify sorted order
    const confidenceCells = screen.getAllByRole('cell', { name: /\d+\.\d+%/ });
    const confidenceValues = confidenceCells.map(cell => 
      parseFloat(cell.textContent!.replace('%', ''))
    );
    expect(confidenceValues).toEqual([...confidenceValues].sort((a, b) => b - a));
  });

  it('should implement filtering correctly', async () => {
    const mockResults = createMockSearchResults(5);
    const { user } = renderWithRedux(
      <ResultsGrid {...defaultProps} />,
      {
        status: 'COMPLETED',
        results: mockResults,
        loading: { results: false }
      }
    );

    // Open filter menu for Asset Type
    const filterButton = screen.getByRole('button', { name: /Open Asset Type Menu/i });
    await user.click(filterButton);

    // Apply filter
    const filterInput = screen.getByRole('textbox', { name: /Filter value/i });
    await user.type(filterInput, 'ASSET-1');
    await user.keyboard('{Enter}');

    // Verify filtered results
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(2); // Header + 1 filtered result
    expect(screen.getByText('ASSET-1')).toBeInTheDocument();
  });

  it('should handle real-time updates', async () => {
    const initialResults = createMockSearchResults(2);
    const { store } = renderWithRedux(
      <ResultsGrid {...defaultProps} />,
      {
        status: 'COMPLETED',
        results: initialResults,
        loading: { results: false }
      }
    );

    // Simulate new result arrival
    const newResults = [...initialResults, createMockSearchResults(1)[0]];
    store.dispatch({
      type: 'search/setSearchResults',
      payload: newResults
    });

    // Verify updated grid
    await waitFor(() => {
      const rows = screen.getAllByRole('row');
      expect(rows.length).toBe(4); // Header + 3 results
    });
  });

  it('should handle export functionality', async () => {
    const mockResults = createMockSearchResults(3);
    const { user } = renderWithRedux(
      <ResultsGrid {...defaultProps} />,
      {
        status: 'COMPLETED',
        results: mockResults,
        loading: { results: false }
      }
    );

    const exportButton = screen.getByRole('button', { name: /Export results/i });
    await user.click(exportButton);

    expect(mockOnExport).toHaveBeenCalledWith('csv');
  });

  it('should be accessible', async () => {
    const mockResults = createMockSearchResults(3);
    const { container } = renderWithRedux(
      <ResultsGrid {...defaultProps} />,
      {
        status: 'COMPLETED',
        results: mockResults,
        loading: { results: false }
      }
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should handle empty state correctly', () => {
    renderWithRedux(
      <ResultsGrid {...defaultProps} />,
      {
        status: 'COMPLETED',
        results: [],
        loading: { results: false }
      }
    );

    expect(screen.getByText('No results found')).toBeInTheDocument();
    const exportButton = screen.getByRole('button', { name: /Export results/i });
    expect(exportButton).toBeDisabled();
  });

  it('should handle error state correctly', () => {
    renderWithRedux(
      <ResultsGrid {...defaultProps} />,
      {
        status: 'FAILED',
        results: [],
        loading: { results: false },
        error: 'Failed to load results'
      }
    );

    expect(screen.getByText('Failed to load results')).toBeInTheDocument();
  });
});