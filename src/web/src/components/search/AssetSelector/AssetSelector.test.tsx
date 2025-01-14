// External imports - versions specified for dependency management
import React from 'react'; // ^18.2.0
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'; // ^13.4.0
import userEvent from '@testing-library/user-event'; // ^14.4.0
import { Provider } from 'react-redux'; // ^8.0.5
import { configureStore } from '@reduxjs/toolkit'; // ^1.9.0

// Internal imports
import AssetSelector from './AssetSelector';
import { setSearchParameters, selectSearchParameters } from '../../../store/slices/searchSlice';
import { AssetType } from '../../../types/search.types';

// Test constants
const TEST_ASSET_TYPES = [
  { value: 'ENVIRONMENTAL_MONITORING', label: 'Environmental Monitoring' },
  { value: 'INFRASTRUCTURE', label: 'Infrastructure' },
  { value: 'AGRICULTURE', label: 'Agriculture' },
  { value: 'CUSTOM', label: 'Custom' }
] as const;

const TEST_ERROR_MESSAGES = {
  required: 'Asset type selection is required',
  invalid: 'Please select a valid asset type'
};

// Mock store setup
const createTestStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      search: (state = initialState, action) => {
        switch (action.type) {
          case setSearchParameters.type:
            return { ...state, parameters: action.payload };
          default:
            return state;
        }
      }
    }
  });
};

// Helper function to render component with Redux store
const renderWithRedux = (
  component: React.ReactElement,
  { initialState = {} } = {}
) => {
  const store = createTestStore(initialState);
  const user = userEvent.setup();
  return {
    ...render(<Provider store={store}>{component}</Provider>),
    store,
    user
  };
};

describe('AssetSelector Component', () => {
  describe('Rendering and Basic Functionality', () => {
    it('renders correctly with default props', () => {
      const { container } = renderWithRedux(<AssetSelector />);
      
      expect(screen.getByLabelText(/select satellite data asset type/i)).toBeInTheDocument();
      expect(container.querySelector('#asset-type-selector')).toBeInTheDocument();
      expect(screen.getByText('Asset Type')).toBeInTheDocument();
    });

    it('displays all asset type options', async () => {
      const { user } = renderWithRedux(<AssetSelector />);
      
      await user.click(screen.getByRole('button'));
      
      TEST_ASSET_TYPES.forEach(({ label }) => {
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    });

    it('shows required error when no selection is made', async () => {
      const { user } = renderWithRedux(<AssetSelector required />);
      
      await user.click(screen.getByRole('button'));
      await user.click(document.body); // Click away to trigger validation
      
      expect(screen.getByText(TEST_ERROR_MESSAGES.required)).toBeInTheDocument();
    });
  });

  describe('Redux State Management', () => {
    it('updates store when asset type is selected', async () => {
      const { store, user } = renderWithRedux(<AssetSelector />, {
        initialState: { parameters: { assetType: null } }
      });

      await user.click(screen.getByRole('button'));
      await user.click(screen.getByText('Environmental Monitoring'));

      const state = store.getState();
      expect(state.search.parameters.assetType).toBe('ENVIRONMENTAL_MONITORING');
    });

    it('reflects initial state from store', () => {
      const initialState = {
        search: {
          parameters: { assetType: 'INFRASTRUCTURE' as AssetType }
        }
      };

      renderWithRedux(<AssetSelector />, { initialState });
      
      expect(screen.getByRole('button')).toHaveTextContent('Infrastructure');
    });
  });

  describe('Accessibility Compliance', () => {
    it('supports keyboard navigation', async () => {
      const { user } = renderWithRedux(<AssetSelector />);
      
      await user.tab();
      expect(screen.getByRole('button')).toHaveFocus();
      
      await user.keyboard('{Enter}');
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      
      await user.keyboard('{ArrowDown}');
      expect(screen.getByText('Environmental Monitoring')).toHaveFocus();
    });

    it('provides correct ARIA attributes', () => {
      renderWithRedux(<AssetSelector />);
      
      const select = screen.getByRole('button');
      expect(select).toHaveAttribute('aria-label', 'Select satellite data asset type');
      expect(select).toHaveAttribute('aria-required', 'true');
      expect(select).toHaveAttribute('aria-invalid', 'false');
    });

    it('announces validation errors to screen readers', async () => {
      const { user } = renderWithRedux(<AssetSelector required />);
      
      await user.click(screen.getByRole('button'));
      await user.click(document.body);
      
      const error = screen.getByText(TEST_ERROR_MESSAGES.required);
      expect(error).toHaveAttribute('role', 'alert');
    });
  });

  describe('Material Design Implementation', () => {
    it('applies correct Material Design styles', () => {
      const { container } = renderWithRedux(<AssetSelector />);
      
      const select = container.querySelector('.MuiSelect-root');
      expect(select).toHaveClass('MuiOutlinedInput-input');
      expect(select?.parentElement).toHaveClass('MuiOutlinedInput-root');
    });

    it('shows correct hover and focus states', async () => {
      const { user } = renderWithRedux(<AssetSelector />);
      
      const select = screen.getByRole('button');
      await user.hover(select);
      expect(select.parentElement).toHaveClass('Mui-hovered');
      
      await user.click(select);
      expect(select.parentElement).toHaveClass('Mui-focused');
    });

    it('displays proper error states with Material Design', async () => {
      const { user } = renderWithRedux(<AssetSelector required />);
      
      await user.click(screen.getByRole('button'));
      await user.click(document.body);
      
      const formControl = screen.getByTestId('asset-type-selector').parentElement;
      expect(formControl).toHaveClass('Mui-error');
    });
  });

  describe('Custom Validation', () => {
    it('handles custom validation logic', async () => {
      const customValidation = jest.fn((type: AssetType) => type !== 'CUSTOM');
      const { user } = renderWithRedux(
        <AssetSelector customValidation={customValidation} />
      );

      await user.click(screen.getByRole('button'));
      await user.click(screen.getByText('Custom'));

      expect(customValidation).toHaveBeenCalledWith('CUSTOM');
      expect(screen.getByText(TEST_ERROR_MESSAGES.invalid)).toBeInTheDocument();
    });
  });

  describe('Performance Optimization', () => {
    it('prevents unnecessary re-renders with memo', async () => {
      const onChange = jest.fn();
      const { rerender } = renderWithRedux(
        <AssetSelector onChange={onChange} />
      );

      const initialRender = screen.getByRole('button');
      rerender(<AssetSelector onChange={onChange} />);
      const secondRender = screen.getByRole('button');

      expect(initialRender).toBe(secondRender);
    });
  });
});