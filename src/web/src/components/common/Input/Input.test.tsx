import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'; // v14.0.0
import userEvent from '@testing-library/user-event'; // v14.0.0
import { expect, describe, it, beforeEach, jest } from '@jest/globals'; // v29.0.0
import { axe, toHaveNoViolations } from '@axe-core/react'; // v4.7.0
import { ThemeProvider, createTheme } from '@mui/material'; // v5.0.0

import Input from './Input';
import { USER_INPUT_VALIDATION } from '../../../constants/validation.constants';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock theme for Material Design 3.0 testing
const theme = createTheme({
  typography: {
    body1: {
      fontSize: '16px',
      lineHeight: 1.5,
      fontFamily: 'Roboto, sans-serif',
    },
    caption: {
      fontSize: '12px',
    },
  },
  palette: {
    primary: {
      main: '#6200ee',
    },
    error: {
      main: '#b00020',
    },
    text: {
      primary: '#000000',
      secondary: '#666666',
    },
    background: {
      paper: '#ffffff',
    },
    action: {
      disabledBackground: '#f5f5f5',
    },
  },
  spacing: (factor: number) => `${8 * factor}px`,
});

// Helper function to render Input with theme
const renderInput = (props = {}) => {
  const defaultProps = {
    id: 'test-input',
    name: 'test-input',
    label: 'Test Input',
    type: 'text',
    value: '',
    onChange: jest.fn(),
  };

  return render(
    <ThemeProvider theme={theme}>
      <Input {...defaultProps} {...props} />
    </ThemeProvider>
  );
};

describe('Input Component', () => {
  // Basic Rendering Tests
  describe('Rendering', () => {
    it('renders with required props', () => {
      renderInput();
      const input = screen.getByRole('textbox', { name: /test input/i });
      expect(input).toBeInTheDocument();
    });

    it('applies correct Material Design styles', () => {
      renderInput();
      const inputContainer = screen.getByTestId('test-input').closest('.MuiInputBase-root');
      const computedStyles = window.getComputedStyle(inputContainer!);
      
      expect(computedStyles.fontSize).toBe('16px');
      expect(computedStyles.lineHeight).toBe('1.5');
      expect(computedStyles.fontFamily).toMatch(/Roboto/);
    });

    it('renders different input types correctly', () => {
      const { rerender } = renderInput();

      // Test email type
      rerender(
        <ThemeProvider theme={theme}>
          <Input
            id="email-input"
            name="email"
            label="Email"
            type="email"
            value=""
            onChange={jest.fn()}
          />
        </ThemeProvider>
      );
      expect(screen.getByRole('textbox', { name: /email/i })).toHaveAttribute('type', 'email');

      // Test password type
      rerender(
        <ThemeProvider theme={theme}>
          <Input
            id="password-input"
            name="password"
            label="Password"
            type="password"
            value=""
            onChange={jest.fn()}
          />
        </ThemeProvider>
      );
      expect(screen.getByLabelText(/password/i)).toHaveAttribute('type', 'password');
    });
  });

  // Accessibility Tests
  describe('Accessibility', () => {
    it('meets WCAG 2.1 accessibility standards', async () => {
      const { container } = renderInput();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('provides proper ARIA attributes', () => {
      renderInput({ required: true, error: true, helperText: 'Error message' });
      const input = screen.getByRole('textbox');
      
      expect(input).toHaveAttribute('aria-required', 'true');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', 'test-input-helper-text');
    });

    it('maintains keyboard navigation', async () => {
      renderInput();
      const input = screen.getByRole('textbox');
      
      input.focus();
      expect(document.activeElement).toBe(input);
      
      userEvent.tab();
      expect(document.activeElement).not.toBe(input);
    });
  });

  // Validation Tests
  describe('Validation', () => {
    const onChangeMock = jest.fn();
    const onBlurMock = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('validates minimum length requirement', async () => {
      renderInput({
        onChange: onChangeMock,
        onBlur: onBlurMock,
        required: true,
      });

      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'ab');
      fireEvent.blur(input);

      expect(onBlurMock).toHaveBeenCalled();
      expect(screen.getByText(`Minimum ${USER_INPUT_VALIDATION.MIN_LENGTH} characters required`)).toBeInTheDocument();
    });

    it('validates maximum length requirement', async () => {
      renderInput({
        onChange: onChangeMock,
        onBlur: onBlurMock,
      });

      const input = screen.getByRole('textbox');
      const longString = 'a'.repeat(USER_INPUT_VALIDATION.MAX_LENGTH + 1);
      await userEvent.type(input, longString);
      fireEvent.blur(input);

      expect(onBlurMock).toHaveBeenCalled();
      expect(screen.getByText(`Maximum ${USER_INPUT_VALIDATION.MAX_LENGTH} characters allowed`)).toBeInTheDocument();
    });

    it('validates email format', async () => {
      renderInput({
        type: 'email',
        onChange: onChangeMock,
        onBlur: onBlurMock,
      });

      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'invalid-email');
      fireEvent.blur(input);

      expect(onBlurMock).toHaveBeenCalled();
      expect(screen.getByText('Invalid email format')).toBeInTheDocument();
    });

    it('validates phone number format', async () => {
      renderInput({
        type: 'tel',
        onChange: onChangeMock,
        onBlur: onBlurMock,
      });

      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'invalid-phone');
      fireEvent.blur(input);

      expect(onBlurMock).toHaveBeenCalled();
      expect(screen.getByText('Invalid phone number format')).toBeInTheDocument();
    });
  });

  // Interaction Tests
  describe('User Interaction', () => {
    it('handles text input correctly', async () => {
      const onChangeMock = jest.fn();
      renderInput({ onChange: onChangeMock });

      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'test input');

      expect(onChangeMock).toHaveBeenCalledTimes(10); // One call per character
      expect(input).toHaveValue('test input');
    });

    it('manages focus states correctly', async () => {
      renderInput();
      const input = screen.getByRole('textbox');
      const inputContainer = input.closest('.MuiInputBase-root');

      input.focus();
      expect(inputContainer).toHaveClass('Mui-focused');

      input.blur();
      expect(inputContainer).not.toHaveClass('Mui-focused');
    });

    it('handles disabled state correctly', () => {
      renderInput({ disabled: true });
      const input = screen.getByRole('textbox');
      
      expect(input).toBeDisabled();
      expect(input.closest('.MuiInputBase-root')).toHaveClass('Mui-disabled');
    });

    it('supports copy/paste operations', async () => {
      const onChangeMock = jest.fn();
      renderInput({ onChange: onChangeMock });

      const input = screen.getByRole('textbox');
      await userEvent.click(input);
      await userEvent.paste('pasted text');

      expect(onChangeMock).toHaveBeenCalled();
      expect(input).toHaveValue('pasted text');
    });
  });
});