import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { axe, toHaveNoViolations } from 'jest-axe';

// Internal imports
import Timeline from './Timeline';
import { SearchResult, SearchState } from '../../../types/search.types';
import { selectSearchResults, selectSearchStatus } from '../../../store/slices/searchSlice';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock D3 for testing
jest.mock('d3', () => ({
  select: jest.fn(() => ({
    selectAll: jest.fn(() => ({
      remove: jest.fn(),
      data: jest.fn(() => ({
        enter: jest.fn(() => ({
          append: jest.fn(() => ({
            attr: jest.fn(() => ({
              attr: jest.fn()
            }))
          }))
        }))
      }))
    })),
    append: jest.fn(() => ({
      attr: jest.fn(() => ({
        call: jest.fn()
      }))
    }))
  })),
  scaleTime: jest.fn(() => ({
    domain: jest.fn(() => ({
      range: jest.fn(() => ({
        nice: jest.fn()
      }))
    }))
  })),
  scaleLinear: jest.fn(() => ({
    domain: jest.fn(() => ({
      range: jest.fn()
    }))
  })),
  axisBottom: jest.fn(),
  axisLeft: jest.fn(),
  min: jest.fn(),
  max: jest.fn(),
  brushX: jest.fn(() => ({
    extent: jest.fn(() => ({
      on: jest.fn(() => ({
        on: jest.fn()
      }))
    }))
  }))
}));

// Helper function to render with Redux provider
const renderWithProviders = (
  ui: React.ReactNode,
  {
    preloadedState = {},
    store = configureStore({
      reducer: {
        search: (state = preloadedState) => state
      }
    }),
    ...renderOptions
  } = {}
) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

// Mock data generator
const generateMockSearchResults = (count: number): SearchResult[] => {
  return Array.from({ length: count }, (_, index) => ({
    id: `result-${index}`,
    timestamp: new Date(Date.now() + index * 3600000).toISOString(),
    location: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: {}
    },
    confidence: 75 + Math.random() * 20,
    recommendations: [],
    metadata: {
      assetId: `asset-${index}`,
      collectionTime: new Date().toISOString(),
      processingLevel: 'standard',
      resolution: 0,
      costEstimate: 1000,
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
      processingTime: 1200,
      coveragePercentage: 95,
      matchAccuracy: 0.88,
      optimizationScore: 0.92
    }
  }));
};

describe('Timeline Component', () => {
  // Loading state tests
  describe('Loading State', () => {
    it('should display loading spinner when status is IN_PROGRESS', () => {
      renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'IN_PROGRESS',
          results: []
        }
      });

      expect(screen.getByLabelText('Loading timeline data')).toBeInTheDocument();
    });

    it('should have correct ARIA attributes during loading', () => {
      renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'IN_PROGRESS',
          results: []
        }
      });

      const loader = screen.getByRole('progressbar');
      expect(loader).toHaveAttribute('aria-label', 'Loading timeline data');
    });
  });

  // Empty state tests
  describe('Empty State', () => {
    it('should display empty state message when no results are available', () => {
      renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'COMPLETED',
          results: []
        }
      });

      expect(screen.getByText('No collection windows available')).toBeInTheDocument();
    });

    it('should have correct ARIA attributes for empty state', () => {
      renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'COMPLETED',
          results: []
        }
      });

      const emptyState = screen.getByRole('alert');
      expect(emptyState).toHaveTextContent('No collection windows available');
    });
  });

  // Timeline visualization tests
  describe('Timeline Visualization', () => {
    const mockResults = generateMockSearchResults(5);

    it('should render timeline markers for each result', () => {
      renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'COMPLETED',
          results: mockResults
        }
      });

      const markers = screen.getAllByRole('graphics-symbol');
      expect(markers).toHaveLength(mockResults.length);
    });

    it('should display confidence levels correctly', () => {
      renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'COMPLETED',
          results: mockResults
        }
      });

      mockResults.forEach(result => {
        const marker = screen.getByLabelText(
          expect.stringContaining(`${result.confidence}% confidence`)
        );
        expect(marker).toBeInTheDocument();
      });
    });

    it('should format collection windows correctly', () => {
      renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'COMPLETED',
          results: mockResults
        }
      });

      mockResults.forEach(result => {
        const formattedTime = new Date(result.timestamp).toLocaleString();
        const marker = screen.getByLabelText(
          expect.stringContaining(formattedTime)
        );
        expect(marker).toBeInTheDocument();
      });
    });
  });

  // User interaction tests
  describe('User Interactions', () => {
    const mockResults = generateMockSearchResults(5);

    it('should handle keyboard navigation between markers', async () => {
      renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'COMPLETED',
          results: mockResults
        }
      });

      const markers = screen.getAllByRole('graphics-symbol');
      const firstMarker = markers[0].querySelector('.timeline__marker-circle');
      firstMarker?.focus();

      await userEvent.keyboard('{ArrowRight}');
      expect(markers[1].querySelector('.timeline__marker-circle')).toHaveFocus();

      await userEvent.keyboard('{ArrowLeft}');
      expect(markers[0].querySelector('.timeline__marker-circle')).toHaveFocus();
    });

    it('should handle marker selection via keyboard', async () => {
      renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'COMPLETED',
          results: mockResults
        }
      });

      const marker = screen.getAllByRole('graphics-symbol')[0]
        .querySelector('.timeline__marker-circle');
      marker?.focus();

      await userEvent.keyboard('{Enter}');
      expect(marker).toHaveAttribute('aria-selected', 'true');

      await userEvent.keyboard('{Enter}');
      expect(marker).toHaveAttribute('aria-selected', 'false');
    });

    it('should maintain focus when using keyboard navigation at boundaries', async () => {
      renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'COMPLETED',
          results: mockResults
        }
      });

      const markers = screen.getAllByRole('graphics-symbol');
      const firstMarker = markers[0].querySelector('.timeline__marker-circle');
      const lastMarker = markers[markers.length - 1].querySelector('.timeline__marker-circle');

      firstMarker?.focus();
      await userEvent.keyboard('{ArrowLeft}');
      expect(firstMarker).toHaveFocus();

      lastMarker?.focus();
      await userEvent.keyboard('{ArrowRight}');
      expect(lastMarker).toHaveFocus();
    });
  });

  // Accessibility tests
  describe('Accessibility', () => {
    const mockResults = generateMockSearchResults(5);

    it('should have no accessibility violations', async () => {
      const { container } = renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'COMPLETED',
          results: mockResults
        }
      });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have correct ARIA labels and roles', () => {
      renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'COMPLETED',
          results: mockResults
        }
      });

      expect(screen.getByRole('region')).toHaveAttribute(
        'aria-label',
        'Search Results Timeline'
      );
      expect(screen.getByRole('img')).toHaveAttribute(
        'aria-label',
        'Timeline visualization of collection windows'
      );
    });

    it('should support screen reader navigation', () => {
      renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'COMPLETED',
          results: mockResults
        }
      });

      const markers = screen.getAllByRole('graphics-symbol');
      markers.forEach(marker => {
        expect(marker).toHaveAttribute('aria-label', expect.stringContaining('Collection window'));
      });
    });

    it('should maintain focus order during interactions', async () => {
      renderWithProviders(<Timeline />, {
        preloadedState: {
          status: 'COMPLETED',
          results: mockResults
        }
      });

      const markers = screen.getAllByRole('graphics-symbol');
      const circles = markers.map(marker => 
        marker.querySelector('.timeline__marker-circle')
      );

      circles[0]?.focus();
      await userEvent.tab();
      expect(circles[1]).toHaveFocus();

      await userEvent.tab();
      expect(circles[2]).toHaveFocus();
    });
  });
});