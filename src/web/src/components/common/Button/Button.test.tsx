// React v18.2.0
import React from 'react';
// @testing-library/react v13.x
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
// @jest/globals v29.x
import { expect, describe, it, beforeEach, afterEach } from '@jest/globals';
// @mui/material v5.x
import { ThemeProvider, useTheme } from '@mui/material/styles';
// @axe-core/react v4.x
import { axe, toHaveNoViolations } from '@axe-core/react';

// Internal imports
import Button, { ButtonProps } from './Button';
import { defaultTheme } from '../../config/theme.config';

expect.extend(toHaveNoViolations);

// Helper function to render button with theme context
const renderWithTheme = (ui: React.ReactElement, mode: 'light' | 'dark' = 'light') => {
  const theme = {
    ...defaultTheme,
    palette: {
      ...defaultTheme.palette,
      mode,
    },
  };
  return render(
    <ThemeProvider theme={theme}>
      {ui}
    </ThemeProvider>
  );
};

// Helper function to create consistent test props
const createTestProps = (overrides?: Partial<ButtonProps>): ButtonProps => ({
  children: 'Test Button',
  variant: 'contained',
  color: 'primary',
  size: 'medium',
  onClick: jest.fn(),
  ...overrides,
});

describe('Button Component', () => {
  // Mock system theme preference
  beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Accessibility', () => {
    it('should meet WCAG 2.1 Level AA requirements', async () => {
      const { container } = renderWithTheme(
        <Button {...createTestProps()} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have correct ARIA attributes', () => {
      const props = createTestProps({ ariaLabel: 'Test Button Label' });
      renderWithTheme(<Button {...props} />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Test Button Label');
      expect(button).toHaveAttribute('aria-disabled', 'false');
      expect(button).toHaveAttribute('aria-busy', 'false');
    });

    it('should handle disabled state with correct ARIA attributes', () => {
      const props = createTestProps({ disabled: true });
      renderWithTheme(<Button {...props} />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('tabIndex', '-1');
    });

    it('should handle loading state with correct ARIA attributes', () => {
      const props = createTestProps({ loading: true });
      renderWithTheme(<Button {...props} />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    });
  });

  describe('Theming', () => {
    it('should render with correct light theme styles', () => {
      const { container } = renderWithTheme(
        <Button {...createTestProps()} />,
        'light'
      );
      const button = container.firstChild as HTMLElement;
      expect(button).toHaveStyle({
        backgroundColor: defaultTheme.palette.primary.main,
        color: defaultTheme.palette.primary.contrastText,
      });
    });

    it('should render with correct dark theme styles', () => {
      const { container } = renderWithTheme(
        <Button {...createTestProps()} />,
        'dark'
      );
      const button = container.firstChild as HTMLElement;
      expect(button).toHaveStyle({
        backgroundColor: defaultTheme.palette.primary.dark,
        color: defaultTheme.palette.primary.contrastText,
      });
    });

    it('should apply correct size-specific styles', () => {
      const sizes = ['small', 'medium', 'large'] as const;
      sizes.forEach(size => {
        const { container } = renderWithTheme(
          <Button {...createTestProps({ size })} />
        );
        const button = container.firstChild as HTMLElement;
        const expectedHeight = size === 'small' ? '36px' : size === 'large' ? '48px' : '40px';
        expect(button).toHaveStyle({ minHeight: expectedHeight });
      });
    });

    it('should support RTL layout', () => {
      const { container } = renderWithTheme(
        <Button {...createTestProps({ startIcon: <span>icon</span> })} />
      );
      const button = container.firstChild as HTMLElement;
      button.setAttribute('dir', 'rtl');
      
      const startIcon = within(button).getByText('icon');
      expect(startIcon).toHaveStyle({ marginLeft: '8px', marginRight: '0px' });
    });
  });

  describe('Interaction', () => {
    it('should handle click events', async () => {
      const onClick = jest.fn();
      renderWithTheme(
        <Button {...createTestProps({ onClick })} />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should not trigger click when disabled', () => {
      const onClick = jest.fn();
      renderWithTheme(
        <Button {...createTestProps({ onClick, disabled: true })} />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('should not trigger click when loading', () => {
      const onClick = jest.fn();
      renderWithTheme(
        <Button {...createTestProps({ onClick, loading: true })} />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('should show loading spinner and hide content when loading', () => {
      renderWithTheme(
        <Button {...createTestProps({ loading: true })} />
      );
      
      expect(screen.getByLabelText('Loading')).toBeInTheDocument();
      expect(screen.getByText('Test Button')).toHaveStyle({ visibility: 'hidden' });
    });

    it('should handle focus states correctly', () => {
      const { container } = renderWithTheme(
        <Button {...createTestProps()} />
      );
      
      const button = container.firstChild as HTMLElement;
      fireEvent.focus(button);
      expect(button).toHaveStyle({
        outline: `3px solid ${defaultTheme.palette.primary.main}`,
      });
    });
  });
});