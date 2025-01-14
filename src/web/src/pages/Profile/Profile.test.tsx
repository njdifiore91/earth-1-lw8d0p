/**
 * Profile Component Test Suite
 * @version 1.0.0
 * Implements comprehensive testing for user profile management with enhanced
 * security validation, preference updates, and role-based access control
 */

// External imports
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { Auth0Provider } from '@auth0/auth0-react';
import { configureStore } from '@reduxjs/toolkit';
import userEvent from '@testing-library/user-event';

// Internal imports
import Profile from './Profile';
import { UserRole, User, UserPreferences, SecurityPreferences } from '../../types/user.types';
import { authReducer } from '../../store/slices/authSlice';
import { ApiError } from '../../types/api.types';

// Mock security monitor hook
jest.mock('@security/monitor', () => ({
  useSecurityMonitor: () => ({
    validateSession: jest.fn().mockResolvedValue(true),
    validateContext: jest.fn().mockResolvedValue(true),
    sanitizeInput: jest.fn(data => data),
    updateUserPreferences: jest.fn().mockResolvedValue(true),
    updateSecuritySettings: jest.fn().mockResolvedValue(true),
    logEvent: jest.fn(),
    getActiveDevices: jest.fn().mockReturnValue([{ id: 'device-1', lastActive: new Date() }])
  })
}));

// Test data setup
const mockUser: User = {
  id: 'test-user-id',
  email: 'test@example.com',
  role: UserRole.CUSTOMER,
  preferences: {
    theme: 'light',
    defaultSearchLocation: { lat: 0, lng: 0 },
    notifications: {
      email: true,
      searchComplete: true,
      systemUpdates: true,
      searchOptimizations: true,
      securityAlerts: true
    },
    language: 'en',
    timezone: 'UTC',
    accessibility: {
      highContrast: false,
      fontSize: 16,
      reduceMotion: false,
      screenReaderOptimized: false
    }
  },
  lastLogin: new Date('2023-01-01T00:00:00Z'),
  mfaEnabled: false
};

const mockSecurityEvents = [
  {
    type: 'login',
    timestamp: '2023-01-01T00:00:00Z',
    details: { success: true }
  },
  {
    type: 'preferences_update',
    timestamp: '2023-01-01T01:00:00Z',
    details: { success: true }
  }
];

// Helper function to setup test environment
const renderWithProviders = (
  ui: React.ReactElement,
  {
    preloadedState = {},
    store = configureStore({
      reducer: { auth: authReducer },
      preloadedState: {
        auth: {
          user: mockUser,
          isAuthenticated: true,
          loading: false,
          error: null,
          securityEvents: mockSecurityEvents
        },
        ...preloadedState
      }
    })
  } = {}
) => {
  return {
    ...render(
      <Auth0Provider
        domain="test.auth0.com"
        clientId="test-client-id"
        audience="test-audience"
        redirectUri={window.location.origin}
      >
        <Provider store={store}>{ui}</Provider>
      </Auth0Provider>
    ),
    store
  };
};

describe('Profile Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('renders profile page with user information', async () => {
      renderWithProviders(<Profile />);

      expect(screen.getByText('Profile Settings')).toBeInTheDocument();
      expect(screen.getByText(mockUser.email)).toBeInTheDocument();
      expect(screen.getByText(/Last login/)).toBeInTheDocument();
    });

    it('displays appropriate tabs based on user role', () => {
      renderWithProviders(<Profile />);

      expect(screen.getByRole('tab', { name: /General/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Security/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Notifications/i })).toBeInTheDocument();
      
      // Admin tab should not be visible for customer role
      expect(screen.queryByRole('tab', { name: /Advanced/i })).not.toBeInTheDocument();
    });

    it('shows admin tab for admin users', () => {
      const adminUser = { ...mockUser, role: UserRole.ADMIN };
      renderWithProviders(<Profile />, {
        preloadedState: {
          auth: {
            user: adminUser,
            isAuthenticated: true,
            loading: false
          }
        }
      });

      expect(screen.getByRole('tab', { name: /Advanced/i })).toBeInTheDocument();
    });
  });

  describe('Security Features', () => {
    it('handles MFA toggle correctly', async () => {
      const { store } = renderWithProviders(<Profile />);
      
      // Navigate to security tab
      fireEvent.click(screen.getByRole('tab', { name: /Security/i }));
      
      const mfaToggle = screen.getByRole('switch', { name: /Enable 2FA/i });
      fireEvent.click(mfaToggle);

      await waitFor(() => {
        expect(store.getState().auth.user.mfaEnabled).toBe(true);
      });
    });

    it('displays security events with proper formatting', () => {
      renderWithProviders(<Profile />);
      
      fireEvent.click(screen.getByRole('tab', { name: /Security/i }));
      
      mockSecurityEvents.forEach(event => {
        expect(screen.getByText(event.type)).toBeInTheDocument();
        expect(screen.getByText(new Date(event.timestamp).toLocaleString())).toBeInTheDocument();
      });
    });

    it('validates session on component mount', async () => {
      const { store } = renderWithProviders(<Profile />);
      
      await waitFor(() => {
        expect(store.getState().auth.sessionInfo.lastActivity).toBeTruthy();
      });
    });
  });

  describe('Preference Updates', () => {
    it('handles theme preference updates', async () => {
      const { store } = renderWithProviders(<Profile />);
      
      const themeToggle = screen.getByRole('switch', { name: /Dark Mode/i });
      fireEvent.click(themeToggle);

      await waitFor(() => {
        expect(store.getState().auth.user.preferences.theme).toBe('dark');
      });
    });

    it('updates notification preferences correctly', async () => {
      renderWithProviders(<Profile />);
      
      fireEvent.click(screen.getByRole('tab', { name: /Notifications/i }));
      
      const emailToggle = screen.getByRole('switch', { name: /email/i });
      fireEvent.click(emailToggle);

      await waitFor(() => {
        expect(screen.getByRole('switch', { name: /email/i })).not.toBeChecked();
      });
    });

    it('handles preference save errors appropriately', async () => {
      const mockError: ApiError = {
        code: 'VALIDATION_ERROR',
        message: 'Failed to update preferences',
        details: 'Invalid preference format',
        timestamp: new Date().toISOString()
      };

      jest.spyOn(console, 'error').mockImplementation(() => {});
      
      renderWithProviders(<Profile />);
      
      // Trigger save with invalid data
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(screen.getByText(mockError.message)).toBeInTheDocument();
      });
    });
  });

  describe('Role-Based Access Control', () => {
    it('restricts access to admin features for non-admin users', () => {
      renderWithProviders(<Profile />);
      
      expect(screen.queryByText(/System Settings/i)).not.toBeInTheDocument();
    });

    it('allows admin users to access advanced settings', () => {
      const adminUser = { ...mockUser, role: UserRole.ADMIN };
      renderWithProviders(<Profile />, {
        preloadedState: {
          auth: {
            user: adminUser,
            isAuthenticated: true,
            loading: false
          }
        }
      });

      fireEvent.click(screen.getByRole('tab', { name: /Advanced/i }));
      expect(screen.getByText(/System Settings/i)).toBeInTheDocument();
    });
  });

  describe('Security Event Logging', () => {
    it('logs preference update events', async () => {
      const { store } = renderWithProviders(<Profile />);
      
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        const events = store.getState().auth.securityEvents;
        expect(events[events.length - 1].type).toBe('preferences_update');
      });
    });

    it('logs security setting changes', async () => {
      const { store } = renderWithProviders(<Profile />);
      
      fireEvent.click(screen.getByRole('tab', { name: /Security/i }));
      fireEvent.click(screen.getByRole('switch', { name: /Enable 2FA/i }));

      await waitFor(() => {
        const events = store.getState().auth.securityEvents;
        expect(events[events.length - 1].type).toBe('security_settings_update');
      });
    });
  });
});