import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ThemeProvider } from 'styled-components';
import Legend from './Legend';

// @version @testing-library/react@13.4.0
// @version @testing-library/user-event@14.0.0
// @version @jest/globals@29.0.0
// @version jest-axe@4.7.0
// @version styled-components@5.3.0

expect.extend(toHaveNoViolations);

const mockTheme = {
  colors: {
    primary: '#1976D2',
    hover: 'rgba(0, 0, 0, 0.05)',
    text: '#333333'
  }
};

const mockLegendItems = [
  { id: '1', label: 'High Confidence', color: '#4CAF50', active: true, value: 95 },
  { id: '2', label: 'Medium Confidence', color: '#FFC107', active: true, value: 75 },
  { id: '3', label: 'Low Confidence', color: '#F44336', active: false, value: 45 }
];

const renderLegend = (props = {}) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      <Legend items={mockLegendItems} {...props} />
    </ThemeProvider>
  );
};

describe('Legend Component', () => {
  let onItemClick: jest.Mock;

  beforeEach(() => {
    onItemClick = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders all legend items correctly', () => {
      renderLegend();
      mockLegendItems.forEach(item => {
        const legendItem = screen.getByTestId(`legend-item-${item.id}`);
        expect(legendItem).toBeInTheDocument();
        expect(legendItem).toHaveTextContent(item.label);
      });
    });

    it('applies correct opacity for active/inactive items', () => {
      renderLegend();
      const activeItem = screen.getByTestId('legend-item-1');
      const inactiveItem = screen.getByTestId('legend-item-3');
      
      expect(activeItem).toHaveStyle({ opacity: 1 });
      expect(inactiveItem).toHaveStyle({ opacity: 0.5 });
    });

    it('renders with correct orientation', () => {
      const { rerender } = renderLegend({ orientation: 'horizontal' });
      expect(screen.getByRole('list')).toHaveClass('horizontal');

      rerender(
        <ThemeProvider theme={mockTheme}>
          <Legend items={mockLegendItems} orientation="vertical" />
        </ThemeProvider>
      );
      expect(screen.getByRole('list')).toHaveClass('vertical');
    });
  });

  describe('Accessibility', () => {
    it('meets accessibility standards', async () => {
      const { container } = renderLegend();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has correct ARIA attributes', () => {
      renderLegend({ ariaLabel: 'Test Legend' });
      const legend = screen.getByRole('list');
      expect(legend).toHaveAttribute('aria-label', 'Test Legend');
      
      mockLegendItems.forEach(item => {
        const legendItem = screen.getByTestId(`legend-item-${item.id}`);
        expect(legendItem).toHaveAttribute('aria-selected', item.active ? 'true' : 'false');
      });
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      renderLegend();

      const firstItem = screen.getByTestId('legend-item-1');
      await user.tab();
      expect(firstItem).toHaveFocus();

      await user.keyboard('{ArrowRight}');
      expect(screen.getByTestId('legend-item-2')).toHaveFocus();

      await user.keyboard('{ArrowLeft}');
      expect(firstItem).toHaveFocus();
    });
  });

  describe('Interactions', () => {
    it('calls onItemClick when item is clicked', async () => {
      const user = userEvent.setup();
      renderLegend({ onItemClick });

      await user.click(screen.getByTestId('legend-item-1'));
      expect(onItemClick).toHaveBeenCalledWith(mockLegendItems[0]);
    });

    it('handles keyboard activation', async () => {
      const user = userEvent.setup();
      renderLegend({ onItemClick });

      const firstItem = screen.getByTestId('legend-item-1');
      await user.tab();
      await user.keyboard('{Enter}');
      
      expect(onItemClick).toHaveBeenCalledWith(mockLegendItems[0]);

      await user.keyboard(' ');
      expect(onItemClick).toHaveBeenCalledTimes(2);
    });

    it('applies hover styles on mouse over', async () => {
      const user = userEvent.setup();
      renderLegend();

      const legendItem = screen.getByTestId('legend-item-1');
      await user.hover(legendItem);
      
      expect(legendItem).toHaveStyle({
        backgroundColor: mockTheme.colors.hover
      });
    });
  });

  describe('Responsive Design', () => {
    it('adjusts layout for mobile viewport', () => {
      global.innerWidth = 767;
      global.dispatchEvent(new Event('resize'));
      
      renderLegend({ orientation: 'horizontal' });
      const legend = screen.getByRole('list');
      
      expect(legend).toHaveStyle({
        flexDirection: 'column'
      });
    });

    it('maintains vertical layout on all viewports when orientation is vertical', () => {
      renderLegend({ orientation: 'vertical' });
      const legend = screen.getByRole('list');
      
      expect(legend).toHaveStyle({
        flexDirection: 'column'
      });
    });
  });

  describe('Visual Regression', () => {
    it('matches snapshot with default theme', () => {
      const { container } = renderLegend();
      expect(container).toMatchSnapshot();
    });

    it('matches snapshot with custom theme', () => {
      const customTheme = {
        colors: {
          primary: '#FF0000',
          hover: 'rgba(255, 0, 0, 0.1)',
          text: '#666666'
        }
      };

      const { container } = render(
        <ThemeProvider theme={customTheme}>
          <Legend items={mockLegendItems} />
        </ThemeProvider>
      );
      expect(container).toMatchSnapshot();
    });
  });

  describe('Error Handling', () => {
    it('handles empty items array gracefully', () => {
      renderLegend({ items: [] });
      const legend = screen.getByRole('list');
      expect(legend).toBeEmptyDOMElement();
    });

    it('handles missing optional props', () => {
      renderLegend({ onItemClick: undefined, className: undefined });
      expect(screen.getByRole('list')).toBeInTheDocument();
    });
  });
});