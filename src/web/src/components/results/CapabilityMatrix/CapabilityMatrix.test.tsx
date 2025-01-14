import React from 'react'; // v18.2.0
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'; // v13.4.0
import userEvent from '@testing-library/user-event'; // v14.4.3
import { Provider } from 'react-redux'; // v8.0.5
import { ThemeProvider } from 'styled-components'; // v5.3.6
import { axe, toHaveNoViolations } from 'jest-axe'; // v4.7.3
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.11
import configureStore from 'redux-mock-store';

import CapabilityMatrix from './CapabilityMatrix';
import { SearchResult, AssetType } from '../../../types/search.types';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock data
const mockSearchResults: SearchResult[] = [
  {
    id: '1',
    timestamp: '2023-01-01T00:00:00Z',
    confidence: 0.95,
    metadata: {
      assetType: 'ENVIRONMENTAL_MONITORING',
      collectionTime: '2023-01-01T10:00:00Z',
    },
  },
  {
    id: '2',
    timestamp: '2023-01-01T00:00:00Z',
    confidence: 0.75,
    metadata: {
      assetType: 'INFRASTRUCTURE',
      collectionTime: '2023-01-01T11:00:00Z',
    },
  },
  {
    id: '3',
    timestamp: '2023-01-01T00:00:00Z',
    confidence: 0.85,
    metadata: {
      assetType: 'AGRICULTURE',
      collectionTime: '2023-01-01T12:00:00Z',
    },
  },
] as SearchResult[];

const mockTheme = {
  colors: {
    primary: '#1976d2',
    secondary: '#dc004e',
    text: '#000000',
    background: '#ffffff',
  },
};

// Mock store setup
const mockStore = configureStore([]);
const store = mockStore({
  search: {
    results: mockSearchResults,
  },
});

describe('CapabilityMatrix', () => {
  const defaultProps = {
    width: 800,
    height: 600,
    onCapabilityClick: jest.fn(),
  };

  const renderComponent = (props = {}) => {
    return render(
      <Provider store={store}>
        <ThemeProvider theme={mockTheme}>
          <ErrorBoundary fallback={<div>Error</div>}>
            <CapabilityMatrix {...defaultProps} {...props} />
          </ErrorBoundary>
        </ThemeProvider>
      </Provider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the matrix with correct number of cells', () => {
      renderComponent();
      const cells = screen.getAllByRole('gridcell');
      expect(cells).toHaveLength(mockSearchResults.length);
    });

    it('should display confidence scores correctly', () => {
      renderComponent();
      const cells = screen.getAllByRole('gridcell');
      expect(cells[0]).toHaveTextContent('95%');
      expect(cells[1]).toHaveTextContent('75%');
      expect(cells[2]).toHaveTextContent('85%');
    });

    it('should apply correct color based on confidence threshold', () => {
      renderComponent();
      const cells = screen.getAllByRole('gridcell');
      expect(cells[0]).toHaveStyle({ backgroundColor: '#4CAF50' }); // High confidence
      expect(cells[1]).toHaveStyle({ backgroundColor: '#ffd700' }); // Medium confidence
      expect(cells[2]).toHaveStyle({ backgroundColor: '#4CAF50' }); // High confidence
    });

    it('should handle empty results gracefully', () => {
      const emptyStore = mockStore({ search: { results: [] } });
      render(
        <Provider store={emptyStore}>
          <ThemeProvider theme={mockTheme}>
            <CapabilityMatrix {...defaultProps} />
          </ThemeProvider>
        </Provider>
      );
      expect(screen.queryByRole('grid')).toBeInTheDocument();
      expect(screen.queryAllByRole('gridcell')).toHaveLength(0);
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = renderComponent();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', async () => {
      renderComponent();
      const cells = screen.getAllByRole('gridcell');
      
      // Focus first cell
      cells[0].focus();
      expect(document.activeElement).toBe(cells[0]);

      // Test arrow key navigation
      fireEvent.keyDown(cells[0], { key: 'ArrowRight' });
      expect(document.activeElement).toBe(cells[1]);

      fireEvent.keyDown(cells[1], { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(cells[0]);
    });

    it('should have correct ARIA attributes', () => {
      renderComponent();
      const matrix = screen.getByRole('grid');
      expect(matrix).toHaveAttribute('aria-label', 'Capability Assessment Matrix');

      const cells = screen.getAllByRole('gridcell');
      cells.forEach((cell, index) => {
        const result = mockSearchResults[index];
        expect(cell).toHaveAttribute(
          'aria-label',
          expect.stringContaining(`${result.metadata.assetType} capability with ${Math.round(result.confidence * 100)}% confidence`)
        );
      });
    });
  });

  describe('Interaction', () => {
    it('should call onCapabilityClick with correct parameters when cell is clicked', async () => {
      const onCapabilityClick = jest.fn();
      renderComponent({ onCapabilityClick });

      const cells = screen.getAllByRole('gridcell');
      await userEvent.click(cells[0]);

      expect(onCapabilityClick).toHaveBeenCalledWith(
        'ENVIRONMENTAL_MONITORING',
        0.95,
        {
          start: '2023-01-01T10:00:00Z',
          end: '2023-01-01T10:00:00Z'
        }
      );
    });

    it('should handle keyboard selection with Enter and Space', async () => {
      const onCapabilityClick = jest.fn();
      renderComponent({ onCapabilityClick });

      const cells = screen.getAllByRole('gridcell');
      cells[0].focus();

      fireEvent.keyDown(cells[0], { key: 'Enter' });
      expect(onCapabilityClick).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(cells[0], { key: ' ' });
      expect(onCapabilityClick).toHaveBeenCalledTimes(2);
    });
  });

  describe('Performance', () => {
    it('should efficiently handle large datasets with virtualization', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: `${i}`,
        timestamp: '2023-01-01T00:00:00Z',
        confidence: Math.random(),
        metadata: {
          assetType: `Asset${i}` as AssetType,
          collectionTime: '2023-01-01T10:00:00Z',
        },
      })) as SearchResult[];

      const largeStore = mockStore({
        search: {
          results: largeDataset,
        },
      });

      const { container } = render(
        <Provider store={largeStore}>
          <ThemeProvider theme={mockTheme}>
            <CapabilityMatrix {...defaultProps} />
          </ThemeProvider>
        </Provider>
      );

      // Verify that not all items are rendered at once
      const renderedCells = container.querySelectorAll('[role="gridcell"]');
      expect(renderedCells.length).toBeLessThan(largeDataset.length);
    });

    it('should maintain smooth scrolling performance', async () => {
      const { container } = renderComponent();
      
      // Simulate scroll event
      await act(async () => {
        const grid = container.querySelector('[role="grid"]');
        fireEvent.scroll(grid!, { target: { scrollTop: 500 } });
      });

      // Verify that the scroll event was handled without errors
      expect(container.querySelector('[role="grid"]')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing data gracefully', () => {
      const invalidStore = mockStore({
        search: {
          results: [{ ...mockSearchResults[0], metadata: {} }],
        },
      });

      render(
        <Provider store={invalidStore}>
          <ThemeProvider theme={mockTheme}>
            <ErrorBoundary fallback={<div>Error</div>}>
              <CapabilityMatrix {...defaultProps} />
            </ErrorBoundary>
          </ThemeProvider>
        </Provider>
      );

      expect(screen.queryByText('Error')).not.toBeInTheDocument();
    });

    it('should handle invalid confidence values', () => {
      const invalidStore = mockStore({
        search: {
          results: [{ ...mockSearchResults[0], confidence: -1 }],
        },
      });

      render(
        <Provider store={invalidStore}>
          <ThemeProvider theme={mockTheme}>
            <CapabilityMatrix {...defaultProps} />
          </ThemeProvider>
        </Provider>
      );

      const cell = screen.getByRole('gridcell');
      expect(cell).toHaveStyle({ backgroundColor: '#cccccc' }); // Disabled color
    });
  });

  describe('Theme Support', () => {
    it('should apply dark theme correctly', () => {
      renderComponent({ theme: 'dark' });
      const matrix = screen.getByRole('grid');
      expect(matrix).toHaveStyle({ background: '#1a1a1a' });
    });

    it('should apply light theme correctly', () => {
      renderComponent({ theme: 'light' });
      const matrix = screen.getByRole('grid');
      expect(matrix).toHaveStyle({ background: '#ffffff' });
    });
  });
});