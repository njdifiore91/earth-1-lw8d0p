/**
 * Comprehensive test suite for Login component
 * @version 1.0.0
 * Tests OAuth 2.0 authentication, accessibility compliance, form validation,
 * error handling, and user interactions
 */

// External imports
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

// Auth0 mocking
import { useAuth0 } from '@auth0/auth0-react';
jest.mock('@auth0/auth0-react');

// Internal imports
import Login from './Login';
import { login } from '../../store/slices/authSlice';
import { API_ERROR_CODES } from '../../constants/api.constants';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock FingerprintJS
jest.mock('@fingerprintjs/fingerprintjs', () => ({
  load: jest.fn().mockResolvedValue({
    get: jest.fn().mockResolvedValue({ visitorId: 'mock-device-id' })
  })
}));

/**
 * Test environment setup helper
 */
const setupTestEnvironment = () => {
  // Mock Auth0 hooks
  const mockLoginWithRedirect = jest.fn();
  const mockGetAccessTokenSilently = jest.fn().mockResolvedValue('mock-token');
  (useAuth0 as jest.Mock).mockReturnValue({
    loginWithRedirect: mockLoginWithRedirect,
    isAuthenticated: false,
    getAccessTokenSilently: mockGetAccessTokenSilently
  });

  // Create test store
  const store = configureStore({
    reducer: {
      auth: (state = { loading: false, error: null }, action) => state
    }
  });

  return {
    store,
    mockLoginWithRedirect,
    mockGetAccessTokenSilently
  };
};

/**
 * Enhanced render helper with all required providers
 */
const renderWithProviders = (
  ui: React.ReactElement,
  { store, ...renderOptions } = {}
) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter>
        <ErrorBoundary fallback={<div>Error Boundary</div>}>
          {children}
        </ErrorBoundary>
      </MemoryRouter>
    </Provider>
  );

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    store
  };
};

describe('Login Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Accessibility Compliance', () => {
    it('should meet WCAG 2.1 Level AA standards', async () => {
      const { store } = setupTestEnvironment();
      const { container } = renderWithProviders(<Login />, { store });
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', async () => {
      const { store } = setupTestEnvironment();
      renderWithProviders(<Login />, { store });

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const signInButton = screen.getByRole('button', { name: /sign in$/i });
      const ssoButton = screen.getByRole('button', { name: /sign in with sso/i });

      // Test tab order
      expect(document.body).toHaveFocus();
      userEvent.tab();
      expect(emailInput).toHaveFocus();
      userEvent.tab();
      expect(passwordInput).toHaveFocus();
      userEvent.tab();
      expect(signInButton).toHaveFocus();
      userEvent.tab();
      expect(ssoButton).toHaveFocus();
    });

    it('should have proper ARIA attributes', () => {
      const { store } = setupTestEnvironment();
      renderWithProviders(<Login />, { store });

      const form = screen.getByRole('form');
      expect(form).toHaveAttribute('aria-label', 'Login form');

      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toHaveAttribute('aria-required', 'true');

      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toHaveAttribute('aria-required', 'true');
    });
  });

  describe('Authentication Flows', () => {
    it('should handle successful login', async () => {
      const { store } = setupTestEnvironment();
      const mockDispatch = jest.spyOn(store, 'dispatch');

      renderWithProviders(<Login />, { store });

      await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
      await userEvent.type(screen.getByLabelText(/password/i), 'SecurePassword123!');
      
      fireEvent.click(screen.getByRole('button', { name: /sign in$/i }));

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledWith(
          expect.objectContaining({
            type: expect.stringContaining('auth/login')
          })
        );
      });
    });

    it('should handle MFA challenge', async () => {
      const { store } = setupTestEnvironment();
      store.dispatch = jest.fn().mockResolvedValueOnce({ 
        payload: { mfaRequired: true } 
      });

      renderWithProviders(<Login />, { store });

      await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
      await userEvent.type(screen.getByLabelText(/password/i), 'SecurePassword123!');
      
      fireEvent.click(screen.getByRole('button', { name: /sign in$/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/mfa code/i)).toBeInTheDocument();
      });
    });

    it('should handle SSO login', async () => {
      const { store, mockLoginWithRedirect } = setupTestEnvironment();
      renderWithProviders(<Login />, { store });

      fireEvent.click(screen.getByRole('button', { name: /sign in with sso/i }));

      expect(mockLoginWithRedirect).toHaveBeenCalled();
    });
  });

  describe('Form Validation and Error Handling', () => {
    it('should validate email format', async () => {
      const { store } = setupTestEnvironment();
      renderWithProviders(<Login />, { store });

      await userEvent.type(screen.getByLabelText(/email/i), 'invalid-email');
      fireEvent.blur(screen.getByLabelText(/email/i));

      expect(await screen.findByText(/invalid email format/i)).toBeInTheDocument();
    });

    it('should validate password requirements', async () => {
      const { store } = setupTestEnvironment();
      renderWithProviders(<Login />, { store });

      await userEvent.type(screen.getByLabelText(/password/i), 'short');
      fireEvent.blur(screen.getByLabelText(/password/i));

      expect(await screen.findByText(/password must be at least 12 characters/i)).toBeInTheDocument();
    });

    it('should handle authentication errors', async () => {
      const { store } = setupTestEnvironment();
      store.dispatch = jest.fn().mockRejectedValueOnce(API_ERROR_CODES.AUTHENTICATION_ERROR);

      renderWithProviders(<Login />, { store });

      await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
      await userEvent.type(screen.getByLabelText(/password/i), 'SecurePassword123!');
      
      fireEvent.click(screen.getByRole('button', { name: /sign in$/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid credentials or authentication failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Loading States and UI Feedback', () => {
    it('should disable form during submission', async () => {
      const { store } = setupTestEnvironment();
      store.dispatch = jest.fn().mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<Login />, { store });

      await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
      await userEvent.type(screen.getByLabelText(/password/i), 'SecurePassword123!');
      
      fireEvent.click(screen.getByRole('button', { name: /sign in$/i }));

      expect(screen.getByLabelText(/email/i)).toBeDisabled();
      expect(screen.getByLabelText(/password/i)).toBeDisabled();
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });

    it('should show loading indicator during submission', async () => {
      const { store } = setupTestEnvironment();
      store.dispatch = jest.fn().mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<Login />, { store });

      await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
      await userEvent.type(screen.getByLabelText(/password/i), 'SecurePassword123!');
      
      fireEvent.click(screen.getByRole('button', { name: /sign in$/i }));

      expect(screen.getByRole('button', { name: /signing in/i })).toHaveTextContent(/signing in/i);
    });
  });
});