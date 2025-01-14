// External imports with version specifications
import React, { useCallback } from 'react'; // ^18.2.0
import { 
  Select as MuiSelect,
  FormControl,
  InputLabel,
  MenuItem,
  FormHelperText
} from '@mui/material'; // ^5.x
import { styled, useTheme } from '@mui/material/styles'; // ^5.x

// Internal imports
import { ThemeMode } from '../../../types/global';

// Styled components with Material Design 3.0 specifications
const StyledFormControl = styled(FormControl)(({ theme, fullWidth }) => ({
  marginBottom: theme.spacing(2),
  minWidth: 120,
  width: fullWidth ? '100%' : 'auto',
  '& .MuiOutlinedInput-root': {
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.paper,
    transition: theme.transitions.create(['border-color', 'box-shadow']),
    '&:hover': {
      borderColor: theme.palette.primary.main,
    },
    '&.Mui-focused': {
      borderColor: theme.palette.primary.main,
      boxShadow: `0 0 0 2px ${theme.palette.primary.main}25`,
    }
  }
}));

const StyledMenuItem = styled(MenuItem)(({ theme }) => ({
  fontSize: theme.typography.body1.fontSize,
  padding: theme.spacing(1, 2),
  transition: 'background-color 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
  '&:hover': {
    backgroundColor: `${theme.palette.primary.main}14`
  },
  '&.Mui-selected': {
    backgroundColor: `${theme.palette.primary.main}1A`,
    '&:hover': {
      backgroundColor: `${theme.palette.primary.main}29`
    }
  }
}));

// Interface definitions
interface SelectProps {
  value: string | number | null;
  onChange: (value: string | number) => void;
  options: Array<{ value: string | number; label: string }>;
  label: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  id?: string;
  'aria-label'?: string;
}

// Memoized change handler hook
const useSelectChangeHandler = (onChange: (value: string | number) => void) => {
  return useCallback((event: React.ChangeEvent<{ value: unknown }>) => {
    const value = event.target.value;
    if (value !== null && value !== undefined) {
      onChange(value as string | number);
    }
  }, [onChange]);
};

// Main select component with accessibility support
const Select: React.FC<SelectProps> = React.memo(({
  value,
  onChange,
  options,
  label,
  error = false,
  helperText,
  disabled = false,
  required = false,
  fullWidth = false,
  id,
  'aria-label': ariaLabel,
}) => {
  const theme = useTheme();
  const handleChange = useSelectChangeHandler(onChange);
  
  // Generate unique ID if not provided
  const selectId = id || `select-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const labelId = `${selectId}-label`;
  const helperTextId = helperText ? `${selectId}-helper-text` : undefined;

  return (
    <StyledFormControl 
      fullWidth={fullWidth}
      error={error}
      disabled={disabled}
      required={required}
    >
      <InputLabel 
        id={labelId}
        required={required}
        error={error}
      >
        {label}
      </InputLabel>
      <MuiSelect
        id={selectId}
        labelId={labelId}
        value={value ?? ''}
        onChange={handleChange}
        aria-label={ariaLabel || label}
        aria-describedby={helperTextId}
        aria-required={required}
        aria-invalid={error}
        label={label}
        disabled={disabled}
      >
        {options.map(({ value: optionValue, label: optionLabel }) => (
          <StyledMenuItem 
            key={optionValue} 
            value={optionValue}
            role="option"
            aria-selected={value === optionValue}
          >
            {optionLabel}
          </StyledMenuItem>
        ))}
      </MuiSelect>
      {helperText && (
        <FormHelperText 
          id={helperTextId}
          error={error}
        >
          {helperText}
        </FormHelperText>
      )}
    </StyledFormControl>
  );
});

// Display name for debugging
Select.displayName = 'Select';

export default Select;