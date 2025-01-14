// External imports with version specifications
import React from 'react'; // ^18.2.0
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'; // ^14.0.0
import userEvent from '@testing-library/user-event'; // ^14.0.0
import { ThemeProvider, createTheme } from '@mui/material/styles'; // ^5.x
import { describe, it, expect, jest, beforeEach } from '@jest/globals'; // ^29.0.0

// Internal imports
import Select from './Select';
import { ThemeMode } from '../../../types/global';

// Helper function to render component with theme
const renderWithTheme = (children: React.ReactNode, mode: ThemeMode = 'light') => {
  const theme = createTheme({
    palette: {
      mode,
      primary: {
        main: mode === 'light' ? '#1976d2' : '#90caf9'
      }
    }
  });

  return render(
    <ThemeProvider theme={theme}>
      {children}
    </ThemeProvider>
  );
};

// Default test props
const defaultProps = {
  label: 'Test Select',
  options: [
    { value: '1', label: 'Option 1' },
    { value: '2', label: 'Option 2' },
    { value: '3', label: 'Option 3' }
  ],
  value: '',
  onChange: jest.fn(),
  helperText: '',
  error: false,
  required: false,
  fullWidth: true,
  disabled: false
};

describe('Select Component Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithTheme(<Select {...defaultProps} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('displays provided label correctly', () => {
    renderWithTheme(<Select {...defaultProps} />);
    expect(screen.getByLabelText('Test Select')).toBeInTheDocument();
  });

  it('renders all options in correct order', async () => {
    renderWithTheme(<Select {...defaultProps} />);
    fireEvent.mouseDown(screen.getByRole('button'));
    
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent('Option 1');
    expect(options[1]).toHaveTextContent('Option 2');
    expect(options[2]).toHaveTextContent('Option 3');
  });

  it('applies fullWidth prop styling', () => {
    const { container } = renderWithTheme(<Select {...defaultProps} fullWidth />);
    expect(container.firstChild).toHaveStyle({ width: '100%' });
  });

  it('shows helper text when provided', () => {
    renderWithTheme(<Select {...defaultProps} helperText="Help text" />);
    expect(screen.getByText('Help text')).toBeInTheDocument();
  });
});

describe('Select Interaction Behavior', () => {
  const user = userEvent.setup();

  it('opens dropdown on click', async () => {
    renderWithTheme(<Select {...defaultProps} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('closes dropdown on outside click', async () => {
    renderWithTheme(<Select {...defaultProps} />);
    await user.click(screen.getByRole('button'));
    await user.click(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selects option on click', async () => {
    renderWithTheme(<Select {...defaultProps} />);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Option 1'));
    expect(defaultProps.onChange).toHaveBeenCalledWith('1');
  });

  it('handles keyboard navigation', async () => {
    renderWithTheme(<Select {...defaultProps} />);
    const select = screen.getByRole('button');
    
    // Open with keyboard
    await user.type(select, '{Enter}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    
    // Navigate with arrows
    await user.type(select, '{ArrowDown}');
    await user.type(select, '{Enter}');
    expect(defaultProps.onChange).toHaveBeenCalledWith('1');
  });

  it('prevents interaction when disabled', async () => {
    renderWithTheme(<Select {...defaultProps} disabled />);
    await user.click(screen.getByRole('button'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('Select Accessibility', () => {
  it('has correct ARIA labels and roles', () => {
    renderWithTheme(<Select {...defaultProps} />);
    const select = screen.getByRole('button');
    expect(select).toHaveAttribute('aria-label', 'Test Select');
    expect(select).toHaveAttribute('aria-haspopup', 'listbox');
  });

  it('announces selected options to screen readers', async () => {
    renderWithTheme(<Select {...defaultProps} value="1" />);
    const select = screen.getByRole('button');
    expect(select).toHaveAttribute('aria-selected', 'true');
  });

  it('handles required field announcements', () => {
    renderWithTheme(<Select {...defaultProps} required />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-required', 'true');
  });

  it('provides clear error announcements', () => {
    renderWithTheme(<Select {...defaultProps} error helperText="Error message" />);
    expect(screen.getByText('Error message')).toHaveAttribute('role', 'alert');
  });
});

describe('Select Theming', () => {
  it('applies light theme colors correctly', () => {
    renderWithTheme(<Select {...defaultProps} />, 'light');
    const select = screen.getByRole('button');
    expect(select).toHaveStyle({ backgroundColor: 'rgb(255, 255, 255)' });
  });

  it('applies dark theme colors correctly', () => {
    renderWithTheme(<Select {...defaultProps} />, 'dark');
    const select = screen.getByRole('button');
    expect(select).toHaveStyle({ backgroundColor: 'rgb(18, 18, 18)' });
  });

  it('maintains contrast ratios in both themes', async () => {
    const { rerender } = renderWithTheme(<Select {...defaultProps} />, 'light');
    let select = screen.getByRole('button');
    expect(select).toHaveStyle({ color: 'rgba(0, 0, 0, 0.87)' });

    rerender(
      <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>
        <Select {...defaultProps} />
      </ThemeProvider>
    );
    select = screen.getByRole('button');
    expect(select).toHaveStyle({ color: 'rgb(255, 255, 255)' });
  });
});

describe('Select Validation', () => {
  it('displays error state visually', () => {
    renderWithTheme(<Select {...defaultProps} error />);
    const select = screen.getByRole('button');
    expect(select).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows error message below field', () => {
    renderWithTheme(<Select {...defaultProps} error helperText="Error message" />);
    const helperText = screen.getByText('Error message');
    expect(helperText).toHaveStyle({ color: 'rgb(211, 47, 47)' });
  });

  it('handles required field validation', async () => {
    const user = userEvent.setup();
    renderWithTheme(<Select {...defaultProps} required />);
    
    const select = screen.getByRole('button');
    await user.click(select);
    await user.click(document.body); // Click away
    
    expect(select).toHaveAttribute('aria-invalid', 'true');
  });

  it('maintains error state until valid selection', async () => {
    const user = userEvent.setup();
    renderWithTheme(<Select {...defaultProps} error />);
    
    const select = screen.getByRole('button');
    await user.click(select);
    await user.click(screen.getByText('Option 1'));
    
    expect(defaultProps.onChange).toHaveBeenCalledWith('1');
  });
});