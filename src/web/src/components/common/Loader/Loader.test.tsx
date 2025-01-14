import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react'; // v14.0.0
import userEvent from '@testing-library/user-event'; // v14.0.0
import { axe, toHaveNoViolations } from 'jest-axe'; // v4.7.0
import Loader from './Loader';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock window.matchMedia
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });

  // Mock Performance API
  window.performance.mark = jest.fn();
  window.performance.measure = jest.fn();
});

describe('Loader Component', () => {
  describe('Rendering and Props', () => {
    test('renders circular loader by default', () => {
      render(<Loader />);
      const loader = screen.getByTestId('loader');
      expect(loader).toHaveClass('loader--circular');
      expect(loader).toHaveAttribute('role', 'progressbar');
    });

    test('renders with different sizes', () => {
      const { rerender } = render(<Loader size="small" />);
      expect(screen.getByTestId('loader')).toHaveClass('loader--small');

      rerender(<Loader size="medium" />);
      expect(screen.getByTestId('loader')).toHaveClass('loader--medium');

      rerender(<Loader size="large" />);
      expect(screen.getByTestId('loader')).toHaveClass('loader--large');
    });

    test('renders linear variant correctly', () => {
      render(<Loader variant="linear" />);
      const loader = screen.getByTestId('loader');
      expect(loader).toHaveClass('loader--linear');
      expect(loader.querySelector('.loader__bar')).toBeInTheDocument();
      expect(loader.querySelector('.loader__bar-inner')).toBeInTheDocument();
    });

    test('applies color variants correctly', () => {
      const { rerender } = render(<Loader color="primary" />);
      expect(screen.getByTestId('loader')).toHaveClass('loader--primary');

      rerender(<Loader color="secondary" />);
      expect(screen.getByTestId('loader')).toHaveClass('loader--secondary');
    });

    test('accepts and applies custom className', () => {
      render(<Loader className="custom-class" />);
      expect(screen.getByTestId('loader')).toHaveClass('custom-class');
    });
  });

  describe('Accessibility', () => {
    test('meets WCAG accessibility guidelines', async () => {
      const { container } = render(<Loader />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    test('has correct ARIA attributes', () => {
      render(<Loader ariaLabel="Custom loading message" />);
      const loader = screen.getByTestId('loader');
      
      expect(loader).toHaveAttribute('role', 'progressbar');
      expect(loader).toHaveAttribute('aria-label', 'Custom loading message');
      expect(loader).toHaveAttribute('aria-valuemin', '0');
      expect(loader).toHaveAttribute('aria-valuemax', '100');
      expect(loader).toHaveAttribute('aria-valuenow');
    });

    test('respects reduced motion preferences', () => {
      // Mock reduced motion preference
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      render(<Loader />);
      expect(screen.getByTestId('loader')).toHaveClass('loader--reduced-motion');
    });
  });

  describe('Performance', () => {
    test('creates performance marks on mount and cleanup', () => {
      const { unmount } = render(<Loader />);
      
      expect(window.performance.mark).toHaveBeenCalledWith('loader-start');
      
      unmount();
      
      expect(window.performance.mark).toHaveBeenCalledWith('loader-end');
      expect(window.performance.measure).toHaveBeenCalledWith(
        'loader-duration',
        'loader-start',
        'loader-end'
      );
    });

    test('handles animation errors gracefully', () => {
      render(<Loader />);
      const loader = screen.getByTestId('loader');
      
      // Simulate animation error
      act(() => {
        window.dispatchEvent(new Event('error'));
      });
      
      // Check if transform is removed as fallback
      expect(loader).toHaveStyle({ transform: 'none' });
    });
  });

  describe('Error Handling', () => {
    test('renders fallback for invalid props', () => {
      // @ts-expect-error Testing invalid prop
      render(<Loader size="invalid" />);
      expect(screen.getByTestId('loader')).toHaveClass('loader--medium');
    });

    test('cleanup removes event listeners', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      const { unmount } = render(<Loader />);
      
      unmount();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'error',
        expect.any(Function)
      );
    });
  });

  describe('Memo and Re-rendering', () => {
    test('prevents unnecessary re-renders with same props', () => {
      const { rerender } = render(<Loader />);
      const initialLoader = screen.getByTestId('loader');
      
      rerender(<Loader />);
      const rerenderedLoader = screen.getByTestId('loader');
      
      expect(initialLoader).toBe(rerenderedLoader);
    });
  });
});