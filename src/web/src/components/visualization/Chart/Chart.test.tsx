import React from 'react'; // v18.2.0
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'; // v14.0.0
import userEvent from '@testing-library/user-event'; // v14.0.0
import { axe, toHaveNoViolations } from 'jest-axe'; // v7.0.0
import '@testing-library/jest-dom/extend-expect'; // v5.16.5

import Chart, { ChartProps, ChartType } from './Chart';
import { ApiResponse } from '../../../types/api.types';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock D3.js
jest.mock('d3', () => ({
  select: jest.fn(() => ({
    append: jest.fn().mockReturnThis(),
    attr: jest.fn().mockReturnThis(),
    call: jest.fn().mockReturnThis(),
    selectAll: jest.fn().mockReturnThis(),
    data: jest.fn().mockReturnThis(),
    enter: jest.fn().mockReturnThis(),
    remove: jest.fn().mockReturnThis(),
    datum: jest.fn().mockReturnThis(),
  })),
  scaleTime: jest.fn(() => ({
    domain: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
  })),
  scaleLinear: jest.fn(() => ({
    domain: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
  })),
  extent: jest.fn(),
  max: jest.fn(),
  line: jest.fn(() => ({
    x: jest.fn().mockReturnThis(),
    y: jest.fn().mockReturnThis(),
  })),
  axisBottom: jest.fn(),
  axisLeft: jest.fn(),
  zoom: jest.fn(() => ({
    scaleExtent: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
  })),
  brush: jest.fn(() => ({
    extent: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
  })),
}));

// Mock ResizeObserver
const mockResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

global.ResizeObserver = mockResizeObserver;

// Test data
const mockTimelineData = {
  values: [
    { date: new Date('2023-01-01'), value: 10 },
    { date: new Date('2023-01-02'), value: 20 },
    { date: new Date('2023-01-03'), value: 15 },
  ],
  xAccessor: (d: any) => d.date,
  yAccessor: (d: any) => d.value,
};

const mockMatrixData = {
  values: [
    { x: 0, y: 10, confidence: 0.8 },
    { x: 1, y: 20, confidence: 0.9 },
    { x: 2, y: 15, confidence: 0.7 },
  ],
  xAccessor: (d: any) => d.x,
  yAccessor: (d: any) => d.y,
};

const mockWindowsData = {
  values: [
    { time: new Date('2023-01-01T10:00:00'), duration: 30 },
    { time: new Date('2023-01-01T14:00:00'), duration: 45 },
    { time: new Date('2023-01-01T18:00:00'), duration: 60 },
  ],
  xAccessor: (d: any) => d.time,
  yAccessor: (d: any) => d.duration,
};

describe('Chart Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    performance.mark = jest.fn();
    performance.measure = jest.fn();
  });

  describe('Rendering', () => {
    it('should render timeline chart correctly', () => {
      render(
        <Chart
          type="timeline"
          data={mockTimelineData}
          config={{ width: 600, height: 400 }}
        />
      );

      expect(screen.getByRole('img')).toBeInTheDocument();
      expect(screen.getByTitle('Data Visualization Chart')).toBeInTheDocument();
    });

    it('should render matrix chart correctly', () => {
      render(
        <Chart
          type="matrix"
          data={mockMatrixData}
          config={{ width: 600, height: 400 }}
        />
      );

      expect(screen.getByRole('img')).toBeInTheDocument();
    });

    it('should render collection windows chart correctly', () => {
      render(
        <Chart
          type="windows"
          data={mockWindowsData}
          config={{ width: 600, height: 400 }}
        />
      );

      expect(screen.getByRole('img')).toBeInTheDocument();
    });

    it('should show loader while data is being processed', () => {
      render(
        <Chart
          type="timeline"
          data={mockTimelineData}
          config={{ width: 600, height: 400 }}
        />
      );

      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    const mockInteractionHandlers = {
      onZoom: jest.fn(),
      onBrush: jest.fn(),
      onClick: jest.fn(),
      onHover: jest.fn(),
    };

    it('should handle zoom interactions', async () => {
      render(
        <Chart
          type="timeline"
          data={mockTimelineData}
          config={{ interactive: true }}
          onInteraction={mockInteractionHandlers}
        />
      );

      const chart = screen.getByRole('img');
      fireEvent.wheel(chart, { deltaY: -100 });

      await waitFor(() => {
        expect(mockInteractionHandlers.onZoom).toHaveBeenCalled();
      });
    });

    it('should handle brush interactions', async () => {
      render(
        <Chart
          type="timeline"
          data={mockTimelineData}
          config={{ interactive: true }}
          onInteraction={mockInteractionHandlers}
        />
      );

      const chart = screen.getByRole('img');
      fireEvent.mouseDown(chart, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(chart, { clientX: 200, clientY: 200 });
      fireEvent.mouseUp(chart);

      await waitFor(() => {
        expect(mockInteractionHandlers.onBrush).toHaveBeenCalled();
      });
    });

    it('should handle keyboard navigation when enabled', () => {
      render(
        <Chart
          type="timeline"
          data={mockTimelineData}
          config={{ 
            interactive: true,
            accessibility: { enableKeyboardNav: true }
          }}
          onInteraction={mockInteractionHandlers}
        />
      );

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(mockInteractionHandlers.onClick).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should meet WCAG accessibility guidelines', async () => {
      const { container } = render(
        <Chart
          type="timeline"
          data={mockTimelineData}
          config={{
            accessibility: {
              announceDataChanges: true,
              enableKeyboardNav: true
            }
          }}
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper ARIA attributes', () => {
      render(
        <Chart
          type="timeline"
          data={mockTimelineData}
          config={{ width: 600, height: 400 }}
        />
      );

      const chart = screen.getByRole('img');
      expect(chart).toHaveAttribute('aria-label');
      expect(screen.getByRole('graphics-document')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should handle large datasets efficiently', async () => {
      const largeDataset = {
        values: Array.from({ length: 1000 }, (_, i) => ({
          date: new Date(2023, 0, i),
          value: Math.random() * 100
        })),
        xAccessor: (d: any) => d.date,
        yAccessor: (d: any) => d.value,
      };

      const startTime = performance.now();
      
      render(
        <Chart
          type="timeline"
          data={largeDataset}
          config={{ width: 600, height: 400 }}
        />
      );

      const renderTime = performance.now() - startTime;
      expect(renderTime).toBeLessThan(1000); // Should render in less than 1 second
    });

    it('should clean up resources on unmount', () => {
      const { unmount } = render(
        <Chart
          type="timeline"
          data={mockTimelineData}
          config={{ responsive: true }}
        />
      );

      unmount();
      expect(mockResizeObserver).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when rendering fails', () => {
      const invalidData = {
        values: [{ invalid: 'data' }],
        xAccessor: (d: any) => d.nonexistent,
        yAccessor: (d: any) => d.nonexistent,
      };

      render(
        <Chart
          type="timeline"
          data={invalidData}
          config={{ width: 600, height: 400 }}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should handle missing data gracefully', () => {
      const emptyData = {
        values: [],
        xAccessor: (d: any) => d.x,
        yAccessor: (d: any) => d.y,
      };

      render(
        <Chart
          type="timeline"
          data={emptyData}
          config={{ width: 600, height: 400 }}
        />
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});