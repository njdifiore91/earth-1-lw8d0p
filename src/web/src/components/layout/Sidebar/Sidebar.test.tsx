// React v18.2.0
import React from 'react';
// @testing-library/react v14.0.0
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// react-redux v8.1.0
import { Provider } from 'react-redux';
// @reduxjs/toolkit v1.9.5
import { configureStore } from '@reduxjs/toolkit';
// styled-components v5.3.10
import { ThemeProvider } from 'styled-components';

// Internal imports
import Sidebar, { SidebarProps } from './Sidebar';
import { toggleSidebar } from '../../../store/slices/uiSlice';
import { UserRole } from '../../../types/user.types';
import { defaultTheme } from '../../../config/theme.config';

/**
 * Helper function to render components with required providers
 */
const renderWithProviders = (
  ui: React.ReactElement,
  {
    preloadedState = {},
    store = configureStore({
      reducer: {
        ui: (state = { sidebarOpen: true }) => state,
        auth: (state = { user: { role: UserRole.CUSTOMER } }) => state,
      },
      preloadedState,
    }),
    ...renderOptions
  } = {}
) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <ThemeProvider theme={defaultTheme}>
        {children}
      </ThemeProvider>
    </Provider>
  );

  return {
    store,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
};

/**
 * Helper function to simulate window resize events
 */
const resizeWindow = (width: number, height: number) => {
  window.innerWidth = width;
  window.innerHeight = height;
  window.dispatchEvent(new Event('resize'));
};

/**
 * Mock window.matchMedia for responsive testing
 */
const mockMatchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: jest.fn(),
  removeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
});

describe('Sidebar rendering', () => {
  beforeAll(() => {
    window.matchMedia = jest.fn().mockImplementation(mockMatchMedia);
    window.analytics = {
      track: jest.fn(),
    };
  });

  it('renders correctly for customer role', () => {
    const { container } = renderWithProviders(<Sidebar />);
    
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('New Search')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
    
    // Visual hierarchy validation
    const listItems = container.querySelectorAll('.MuiListItem-root');
    expect(listItems[0]).toHaveStyle({ marginBottom: '4px' });
  });

  it('renders correctly for admin role', () => {
    const { container } = renderWithProviders(<Sidebar />, {
      preloadedState: {
        auth: { user: { role: UserRole.ADMIN } },
      },
    });

    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    expect(container.querySelectorAll('.MuiListItem-root')).toHaveLength(4);
  });

  it('applies correct styling based on theme', () => {
    const { container } = renderWithProviders(<Sidebar />);
    
    const drawer = container.querySelector('.MuiDrawer-paper');
    expect(drawer).toHaveStyle({
      width: '280px',
      backgroundColor: defaultTheme.palette.background.paper,
    });
  });
});

describe('Sidebar responsiveness', () => {
  it('collapses correctly on mobile view', async () => {
    const { store } = renderWithProviders(<Sidebar />);
    
    resizeWindow(767, 1000); // Mobile breakpoint
    await waitFor(() => {
      const drawer = screen.getByRole('navigation');
      expect(drawer).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('shows expanded view on desktop', async () => {
    const { store } = renderWithProviders(<Sidebar />);
    
    resizeWindow(1200, 1000); // Desktop breakpoint
    await waitFor(() => {
      const drawer = screen.getByRole('navigation');
      expect(drawer).not.toHaveAttribute('aria-hidden');
    });
  });

  it('maintains state across breakpoints', async () => {
    const { store } = renderWithProviders(<Sidebar />);
    
    // Start with desktop view
    resizeWindow(1200, 1000);
    
    // Toggle sidebar
    fireEvent.click(screen.getByLabelText('Close navigation'));
    
    // Switch to mobile
    resizeWindow(767, 1000);
    
    await waitFor(() => {
      expect(store.getState().ui.sidebarOpen).toBeFalsy();
    });
  });
});

describe('Sidebar accessibility', () => {
  it('has correct ARIA attributes', () => {
    renderWithProviders(<Sidebar />);
    
    const navigation = screen.getByRole('navigation');
    expect(navigation).toHaveAttribute('aria-label', 'Main navigation');
    
    const menuItems = screen.getAllByRole('menuitem');
    menuItems.forEach(item => {
      expect(item).toHaveAttribute('tabIndex', '0');
      expect(item).toHaveAttribute('aria-label');
    });
  });

  it('supports keyboard navigation', async () => {
    renderWithProviders(<Sidebar />);
    
    const firstMenuItem = screen.getAllByRole('menuitem')[0];
    firstMenuItem.focus();
    
    fireEvent.keyDown(firstMenuItem, { key: 'Enter' });
    await waitFor(() => {
      expect(window.analytics.track).toHaveBeenCalledWith('Navigation', {
        path: '/dashboard',
      });
    });
  });

  it('maintains focus management', async () => {
    renderWithProviders(<Sidebar />);
    
    const toggleButton = screen.getByLabelText('Close navigation');
    const menuItems = screen.getAllByRole('menuitem');
    
    // Test focus trap
    userEvent.tab();
    expect(toggleButton).toHaveFocus();
    
    userEvent.tab();
    expect(menuItems[0]).toHaveFocus();
    
    // Test focus retention after toggle
    fireEvent.click(toggleButton);
    await waitFor(() => {
      expect(toggleButton).toHaveFocus();
    });
  });
});

describe('Sidebar interactions', () => {
  it('toggles sidebar state correctly', async () => {
    const { store } = renderWithProviders(<Sidebar />);
    
    const toggleButton = screen.getByLabelText('Close navigation');
    fireEvent.click(toggleButton);
    
    await waitFor(() => {
      expect(store.getState().ui.sidebarOpen).toBeFalsy();
    });
  });

  it('handles navigation events', async () => {
    renderWithProviders(<Sidebar />);
    
    const searchMenuItem = screen.getByText('New Search');
    fireEvent.click(searchMenuItem);
    
    await waitFor(() => {
      expect(window.analytics.track).toHaveBeenCalledWith('Navigation', {
        path: '/search',
      });
    });
  });

  it('maintains selected state', () => {
    const { container } = renderWithProviders(<Sidebar />);
    
    const menuItems = container.querySelectorAll('.MuiListItem-root');
    fireEvent.click(menuItems[0]);
    
    expect(menuItems[0]).toHaveClass('Mui-selected');
  });

  it('animates transitions properly', () => {
    const { container } = renderWithProviders(<Sidebar />);
    
    const drawer = container.querySelector('.MuiDrawer-paper');
    expect(drawer).toHaveStyle({
      transition: expect.stringContaining('width'),
    });
  });
});