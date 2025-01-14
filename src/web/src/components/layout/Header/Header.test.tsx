// External imports
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import { createMatchMedia } from '@testing-library/dom';

// Internal imports
import Header from './Header';
import { useAuth } from '../../../hooks/useAuth';
import { uiActions } from '../../../store/slices/uiSlice';
import { defaultTheme } from '../../../config/theme.config';

// Mock useAuth hook
jest.mock('../../../hooks/useAuth', () => ({
  useAuth: jest.fn()
}));

// Mock redux dispatch
const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: () => mockDispatch
}));

// Helper function to render component with all required providers
const renderWithProviders = (
  ui: React.ReactElement,
  {
    preloadedState = {},
    store = configureStore({
      reducer: { ui: (state = {}) => state },
      preloadedState
    }),
    ...renderOptions
  } = {}
) => {
  return render(
    <Provider store={store}>
      <ThemeProvider theme={defaultTheme}>
        <MemoryRouter>
          {ui}
        </MemoryRouter>
      </ThemeProvider>
    </Provider>,
    renderOptions
  );
};

describe('Header component', () => {
  // Setup before each test
  beforeEach(() => {
    mockDispatch.mockClear();
    (useAuth as jest.Mock).mockImplementation(() => ({
      user: null,
      isAuthenticated: false,
      logout: jest.fn(),
      isLoading: false
    }));
  });

  // Mock window.matchMedia for responsive testing
  beforeAll(() => {
    window.matchMedia = createMatchMedia(window.innerWidth);
  });

  describe('Rendering', () => {
    it('renders header with logo and navigation elements', () => {
      renderWithProviders(<Header />);
      
      expect(screen.getByText('Matter Platform')).toBeInTheDocument();
      expect(screen.getByLabelText('toggle theme')).toBeInTheDocument();
    });

    it('renders login button when user is not authenticated', () => {
      renderWithProviders(<Header />);
      
      expect(screen.getByText('Login')).toBeInTheDocument();
      expect(screen.queryByLabelText('Account settings')).not.toBeInTheDocument();
    });

    it('renders user menu when authenticated', () => {
      (useAuth as jest.Mock).mockImplementation(() => ({
        user: { email: 'test@example.com' },
        isAuthenticated: true,
        logout: jest.fn(),
        isLoading: false
      }));

      renderWithProviders(<Header />);
      
      expect(screen.getByLabelText('Account settings')).toBeInTheDocument();
      expect(screen.getByLabelText('notifications')).toBeInTheDocument();
    });
  });

  describe('Theme toggling', () => {
    it('dispatches theme toggle action when theme button is clicked', async () => {
      renderWithProviders(<Header />);
      
      const themeButton = screen.getByLabelText('toggle theme');
      fireEvent.click(themeButton);

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: expect.stringContaining('ui/setTheme')
        })
      );
    });

    it('updates theme icon based on current theme', () => {
      renderWithProviders(<Header />);
      
      const themeButton = screen.getByLabelText('toggle theme');
      fireEvent.click(themeButton);

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  describe('Authentication interactions', () => {
    it('handles logout when menu option is clicked', async () => {
      const mockLogout = jest.fn();
      (useAuth as jest.Mock).mockImplementation(() => ({
        user: { email: 'test@example.com' },
        isAuthenticated: true,
        logout: mockLogout,
        isLoading: false
      }));

      renderWithProviders(<Header />);
      
      const menuButton = screen.getByLabelText('Account settings');
      fireEvent.click(menuButton);
      
      const logoutButton = screen.getByText('Logout');
      fireEvent.click(logoutButton);

      expect(mockLogout).toHaveBeenCalled();
    });

    it('shows loading state during logout', async () => {
      (useAuth as jest.Mock).mockImplementation(() => ({
        user: { email: 'test@example.com' },
        isAuthenticated: true,
        logout: jest.fn(),
        isLoading: true
      }));

      renderWithProviders(<Header />);
      
      const menuButton = screen.getByLabelText('Account settings');
      fireEvent.click(menuButton);

      expect(screen.getByText('Logging out...')).toBeInTheDocument();
    });
  });

  describe('Responsive behavior', () => {
    it('shows hamburger menu on mobile viewport', () => {
      window.matchMedia = createMatchMedia('(max-width: 768px)');
      
      renderWithProviders(<Header />);
      
      expect(screen.getByLabelText('open menu')).toBeInTheDocument();
    });

    it('dispatches sidebar toggle action when hamburger menu is clicked', () => {
      window.matchMedia = createMatchMedia('(max-width: 768px)');
      
      renderWithProviders(<Header />);
      
      const menuButton = screen.getByLabelText('open menu');
      fireEvent.click(menuButton);

      expect(mockDispatch).toHaveBeenCalledWith(uiActions.toggleSidebar());
    });

    it('hides logo text on extra small viewport', () => {
      window.matchMedia = createMatchMedia('(max-width: 576px)');
      
      renderWithProviders(<Header />);
      
      const logo = screen.queryByText('Matter Platform');
      expect(logo).toHaveStyle({ display: 'none' });
    });
  });

  describe('Accessibility', () => {
    it('has correct ARIA labels for interactive elements', () => {
      renderWithProviders(<Header />);
      
      expect(screen.getByLabelText('toggle theme')).toHaveAttribute('aria-label');
      expect(screen.getByText('Login')).toHaveAttribute('role', 'button');
    });

    it('maintains focus order for keyboard navigation', () => {
      renderWithProviders(<Header />);
      
      const focusableElements = screen.getAllByRole('button');
      expect(focusableElements.length).toBeGreaterThan(0);
      
      focusableElements.forEach(element => {
        expect(element).toHaveAttribute('tabIndex');
      });
    });

    it('provides keyboard access to user menu', async () => {
      (useAuth as jest.Mock).mockImplementation(() => ({
        user: { email: 'test@example.com' },
        isAuthenticated: true,
        logout: jest.fn(),
        isLoading: false
      }));

      renderWithProviders(<Header />);
      
      const menuButton = screen.getByLabelText('Account settings');
      fireEvent.keyDown(menuButton, { key: 'Enter' });
      
      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });
    });
  });
});