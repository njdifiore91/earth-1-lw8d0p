// External imports with version specifications
import React from 'react'; // v18.2.0
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'; // v14.0.0
import userEvent from '@testing-library/user-event'; // v14.0.0
import { Provider } from 'react-redux'; // v8.1.0
import { configureStore } from '@reduxjs/toolkit'; // v1.9.5
import { ThemeProvider, createTheme } from '@mui/material'; // v5.0.0

// Internal imports
import Modal from './Modal';
import { setActiveModal } from '../../../store/slices/uiSlice';

// Helper function to render components with providers
const renderWithProviders = (
  component: React.ReactNode,
  {
    initialState = {},
    store = configureStore({
      reducer: {
        ui: (state = { activeModal: null, theme: 'light' }, action) => state
      },
      preloadedState: initialState
    }),
    theme = createTheme({
      spacing: 8,
      components: {
        MuiDialog: {
          styleOverrides: {
            paper: {
              margin: 16
            }
          }
        }
      }
    })
  } = {}
) => {
  const user = userEvent.setup();
  
  return {
    user,
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

describe('Modal Component', () => {
  const mockOnClose = jest.fn();
  const defaultProps = {
    id: 'test-modal',
    title: 'Test Modal',
    children: <div>Test Content</div>,
    maxWidth: 'md' as const,
    fullWidth: true,
    onClose: mockOnClose
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render modal with correct structure when active', () => {
      const { store } = renderWithProviders(
        <Modal {...defaultProps} />,
        {
          initialState: {
            ui: { activeModal: 'test-modal' }
          }
        }
      );

      // Verify modal elements
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Test Modal')).toBeInTheDocument();
      expect(screen.getByText('Test Content')).toBeInTheDocument();
      expect(screen.getByLabelText('Close modal')).toBeInTheDocument();
    });

    it('should not render modal when inactive', () => {
      renderWithProviders(
        <Modal {...defaultProps} />,
        {
          initialState: {
            ui: { activeModal: null }
          }
        }
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should apply correct maxWidth and fullWidth props', () => {
      const { container } = renderWithProviders(
        <Modal {...defaultProps} maxWidth="sm" fullWidth={false} />,
        {
          initialState: {
            ui: { activeModal: 'test-modal' }
          }
        }
      );

      const dialog = container.querySelector('.MuiDialog-paper');
      expect(dialog).toHaveClass('MuiDialog-paperWidthSm');
      expect(dialog).not.toHaveClass('MuiDialog-paperFullWidth');
    });
  });

  describe('Accessibility', () => {
    it('should have correct ARIA attributes', () => {
      renderWithProviders(
        <Modal {...defaultProps} />,
        {
          initialState: {
            ui: { activeModal: 'test-modal' }
          }
        }
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'modal-test-modal-title');
      expect(dialog).toHaveAttribute('aria-describedby', 'modal-test-modal-description');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('should manage focus correctly', async () => {
      const { user } = renderWithProviders(
        <Modal {...defaultProps} />,
        {
          initialState: {
            ui: { activeModal: 'test-modal' }
          }
        }
      );

      const closeButton = screen.getByLabelText('Close modal');
      expect(document.activeElement).toBe(closeButton);

      // Test focus trap
      await user.tab();
      expect(document.activeElement).toBe(closeButton);
    });
  });

  describe('Interactions', () => {
    it('should handle close button click', async () => {
      const { store, user } = renderWithProviders(
        <Modal {...defaultProps} />,
        {
          initialState: {
            ui: { activeModal: 'test-modal' }
          }
        }
      );

      await user.click(screen.getByLabelText('Close modal'));
      
      expect(mockOnClose).toHaveBeenCalled();
      expect(store.getState().ui.activeModal).toBeNull();
    });

    it('should handle backdrop click', async () => {
      const { store, user } = renderWithProviders(
        <Modal {...defaultProps} />,
        {
          initialState: {
            ui: { activeModal: 'test-modal' }
          }
        }
      );

      const backdrop = document.querySelector('.MuiBackdrop-root');
      await user.click(backdrop!);

      expect(mockOnClose).toHaveBeenCalled();
      expect(store.getState().ui.activeModal).toBeNull();
    });

    it('should handle escape key press', async () => {
      const { store } = renderWithProviders(
        <Modal {...defaultProps} />,
        {
          initialState: {
            ui: { activeModal: 'test-modal' }
          }
        }
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(mockOnClose).toHaveBeenCalled();
      expect(store.getState().ui.activeModal).toBeNull();
    });
  });

  describe('Redux Integration', () => {
    it('should update store when modal closes', async () => {
      const { store, user } = renderWithProviders(
        <Modal {...defaultProps} />,
        {
          initialState: {
            ui: { activeModal: 'test-modal' }
          }
        }
      );

      await user.click(screen.getByLabelText('Close modal'));
      
      expect(store.getState().ui.activeModal).toBeNull();
    });

    it('should respond to store updates', () => {
      const { store } = renderWithProviders(
        <Modal {...defaultProps} />,
        {
          initialState: {
            ui: { activeModal: null }
          }
        }
      );

      store.dispatch(setActiveModal('test-modal'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      store.dispatch(setActiveModal(null));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Theme Integration', () => {
    it('should apply theme spacing correctly', () => {
      const { container } = renderWithProviders(
        <Modal {...defaultProps} />,
        {
          initialState: {
            ui: { activeModal: 'test-modal' }
          },
          theme: createTheme({
            spacing: 8,
            components: {
              MuiDialog: {
                styleOverrides: {
                  paper: {
                    margin: 16
                  }
                }
              }
            }
          })
        }
      );

      const dialog = container.querySelector('.MuiDialog-paper');
      expect(dialog).toHaveStyle({ margin: '16px' });
    });
  });
});