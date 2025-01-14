// External imports with version specifications
import React from 'react'; // ^18.2.0
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'; // ^14.0.0
import { Provider } from 'react-redux'; // ^8.0.5
import { configureStore } from '@reduxjs/toolkit'; // ^1.9.5
import { ThemeProvider, createTheme } from '@mui/material'; // ^5.11.0

// Internal imports
import Alert from './Alert';
import { uiActions } from '../../../store/slices/uiSlice';

// Test constants
const TEST_ALERT_PROPS = {
  id: 'test-alert',
  type: 'success' as const,
  message: 'Test alert message',
  autoHide: true,
  timeout: 5000
};

const TEST_STORE_STATE = {
  ui: {
    alerts: []
  }
};

/**
 * Helper function to render component with Redux store and theme providers
 */
const renderWithProviders = (
  component: React.ReactElement,
  preloadedState = TEST_STORE_STATE
) => {
  const store = configureStore({
    reducer: {
      ui: (state = preloadedState.ui, action) => state
    },
    preloadedState
  });

  const theme = createTheme({
    components: {
      MuiAlert: {
        styleOverrides: {
          root: {
            // Material Design 3.0 spacing
            padding: '8px 16px'
          }
        }
      }
    }
  });

  return {
    store,
    ...render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          {component}
        </ThemeProvider>
      </Provider>
    )
  };
};

describe('Alert Component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders with correct message and type', () => {
      renderWithProviders(<Alert {...TEST_ALERT_PROPS} />);
      
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(TEST_ALERT_PROPS.message);
      expect(alert).toHaveClass(`MuiAlert-${TEST_ALERT_PROPS.type}`);
    });

    it('applies correct Material Design styles', () => {
      renderWithProviders(<Alert {...TEST_ALERT_PROPS} />);
      
      const alert = screen.getByRole('alert');
      const styles = window.getComputedStyle(alert);
      expect(styles.padding).toBe('8px 16px');
      expect(styles.marginBottom).toBe('8px');
    });

    it('displays correct icon based on type', () => {
      const { rerender } = renderWithProviders(<Alert {...TEST_ALERT_PROPS} />);
      
      // Test each alert type
      ['success', 'error', 'warning', 'info'].forEach(type => {
        rerender(
          <Alert {...TEST_ALERT_PROPS} type={type as 'success' | 'error' | 'warning' | 'info'} />
        );
        const icon = screen.getByTestId(`${type}Icon`);
        expect(icon).toBeInTheDocument();
      });
    });
  });

  describe('Interaction', () => {
    it('triggers removeAlert action when close button is clicked', async () => {
      const { store } = renderWithProviders(<Alert {...TEST_ALERT_PROPS} />);
      const closeButton = screen.getByRole('button', { name: /close alert/i });
      
      fireEvent.click(closeButton);
      
      await waitFor(() => {
        const actions = store.getActions();
        expect(actions).toContainEqual(uiActions.removeAlert(TEST_ALERT_PROPS.id));
      });
    });

    it('handles keyboard navigation correctly', () => {
      renderWithProviders(<Alert {...TEST_ALERT_PROPS} />);
      const closeButton = screen.getByRole('button', { name: /close alert/i });
      
      // Test tab navigation
      closeButton.focus();
      expect(document.activeElement).toBe(closeButton);
      
      // Test keyboard interaction
      fireEvent.keyDown(closeButton, { key: 'Enter' });
      expect(closeButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('auto-dismisses after specified timeout', () => {
      const { store } = renderWithProviders(
        <Alert {...TEST_ALERT_PROPS} autoHide timeout={1000} />
      );
      
      jest.advanceTimersByTime(1000);
      
      const actions = store.getActions();
      expect(actions).toContainEqual(uiActions.removeAlert(TEST_ALERT_PROPS.id));
    });
  });

  describe('Accessibility', () => {
    it('has correct ARIA attributes', () => {
      renderWithProviders(<Alert {...TEST_ALERT_PROPS} />);
      const alert = screen.getByRole('alert');
      
      expect(alert).toHaveAttribute('aria-live', 'polite');
      expect(alert).toHaveAttribute('aria-atomic', 'true');
    });

    it('close button has accessible name and role', () => {
      renderWithProviders(<Alert {...TEST_ALERT_PROPS} />);
      const closeButton = screen.getByRole('button', { name: /close alert/i });
      
      expect(closeButton).toHaveAttribute('aria-label', 'Close alert');
      expect(closeButton).toHaveAttribute('tabIndex', '0');
    });

    it('supports reduced motion preferences', () => {
      renderWithProviders(<Alert {...TEST_ALERT_PROPS} />);
      const alert = screen.getByRole('alert');
      
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mediaQuery.matches) {
        expect(alert).toHaveStyle({ transition: 'none' });
      }
    });

    it('meets minimum touch target size requirements', () => {
      renderWithProviders(<Alert {...TEST_ALERT_PROPS} />);
      const closeButton = screen.getByRole('button', { name: /close alert/i });
      
      const styles = window.getComputedStyle(closeButton);
      expect(parseInt(styles.minWidth)).toBeGreaterThanOrEqual(48);
      expect(parseInt(styles.minHeight)).toBeGreaterThanOrEqual(48);
    });
  });

  describe('Redux Integration', () => {
    it('updates Redux state when alert is removed', async () => {
      const { store } = renderWithProviders(<Alert {...TEST_ALERT_PROPS} />);
      const closeButton = screen.getByRole('button', { name: /close alert/i });
      
      fireEvent.click(closeButton);
      
      await waitFor(() => {
        const state = store.getState();
        expect(state.ui.alerts).not.toContain(TEST_ALERT_PROPS.id);
      });
    });

    it('handles multiple alerts correctly', async () => {
      const { store } = renderWithProviders(
        <>
          <Alert {...TEST_ALERT_PROPS} id="alert1" />
          <Alert {...TEST_ALERT_PROPS} id="alert2" />
        </>
      );
      
      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(2);
      
      fireEvent.click(within(alerts[0]).getByRole('button'));
      
      await waitFor(() => {
        const state = store.getState();
        expect(state.ui.alerts).toHaveLength(1);
        expect(state.ui.alerts[0].id).toBe('alert2');
      });
    });
  });
});