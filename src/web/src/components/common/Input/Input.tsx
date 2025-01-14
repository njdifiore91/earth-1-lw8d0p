import React, { useCallback, useMemo } from 'react';
import { TextField } from '@mui/material'; // v5.x
import { styled } from '@mui/material/styles'; // v5.x
import { ThemeConfig } from '../../../types/global';
import { USER_INPUT_VALIDATION } from '../../../constants/validation.constants';

/**
 * Props interface for the Input component following Material Design 3.0 specifications
 */
interface InputProps {
  name: string;
  id: string;
  type: 'text' | 'number' | 'email' | 'password' | 'search' | 'tel' | 'url';
  value: string | number;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  error?: boolean;
  helperText?: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  autoComplete?: string;
  size?: 'small' | 'medium';
  inputProps?: Record<string, unknown>;
}

/**
 * Styled Material UI TextField component with theme integration
 */
const StyledTextField = styled(TextField)(({ theme }) => ({
  '& .MuiInputBase-root': {
    fontFamily: theme.typography.body1.fontFamily,
    fontSize: theme.typography.body1.fontSize,
    lineHeight: theme.typography.body1.lineHeight,
    transition: 'all 0.2s ease-in-out',
    backgroundColor: theme.palette.background.paper,
  },
  '& .MuiInputLabel-root': {
    color: theme.palette.text.secondary,
    fontSize: theme.typography.caption.fontSize,
    transform: 'translate(14px, 16px) scale(1)',
    '&.Mui-focused': {
      color: theme.palette.primary.main,
    },
  },
  '& .Mui-error': {
    color: theme.palette.error.main,
    borderColor: theme.palette.error.main,
  },
  '& .MuiFormHelperText-root': {
    marginLeft: theme.spacing(1),
    fontSize: theme.typography.caption.fontSize,
    color: theme.palette.text.secondary,
    '&.Mui-error': {
      color: theme.palette.error.main,
    },
  },
  '& .MuiOutlinedInput-root': {
    borderRadius: 4,
    '&:hover': {
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.primary.main,
      },
    },
    '&.Mui-focused': {
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.primary.main,
        borderWidth: 2,
      },
    },
    '&.Mui-error': {
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.error.main,
      },
    },
    '&.Mui-disabled': {
      backgroundColor: theme.palette.action.disabledBackground,
    },
  },
}));

/**
 * Validates input value based on type and validation rules
 */
const handleInputValidation = (
  value: string | number,
  type: InputProps['type']
): { isValid: boolean; errorMessage?: string } => {
  if (!value && typeof value !== 'number') {
    return { isValid: true };
  }

  const stringValue = value.toString();

  // Length validation
  if (stringValue.length < USER_INPUT_VALIDATION.MIN_LENGTH) {
    return {
      isValid: false,
      errorMessage: `Minimum ${USER_INPUT_VALIDATION.MIN_LENGTH} characters required`,
    };
  }

  if (stringValue.length > USER_INPUT_VALIDATION.MAX_LENGTH) {
    return {
      isValid: false,
      errorMessage: `Maximum ${USER_INPUT_VALIDATION.MAX_LENGTH} characters allowed`,
    };
  }

  // Type-specific validation
  switch (type) {
    case 'email':
      const emailRegex = new RegExp(USER_INPUT_VALIDATION.EMAIL_PATTERN);
      if (!emailRegex.test(stringValue)) {
        return { isValid: false, errorMessage: 'Invalid email format' };
      }
      break;

    case 'number':
      const num = Number(value);
      if (isNaN(num)) {
        return { isValid: false, errorMessage: 'Invalid number format' };
      }
      if (num < USER_INPUT_VALIDATION.FIELD_RULES.number?.min) {
        return { isValid: false, errorMessage: 'Value is too small' };
      }
      if (num > USER_INPUT_VALIDATION.FIELD_RULES.number?.max) {
        return { isValid: false, errorMessage: 'Value is too large' };
      }
      break;

    case 'tel':
      if (!USER_INPUT_VALIDATION.FIELD_RULES.phoneNumber.pattern.test(stringValue)) {
        return { isValid: false, errorMessage: 'Invalid phone number format' };
      }
      break;

    case 'url':
      try {
        new URL(stringValue);
      } catch {
        return { isValid: false, errorMessage: 'Invalid URL format' };
      }
      break;
  }

  return { isValid: true };
};

/**
 * Input component following Material Design 3.0 specifications and WCAG 2.1 Level AA compliance
 */
const Input: React.FC<InputProps> = ({
  name,
  id,
  type = 'text',
  value,
  onChange,
  onBlur,
  error = false,
  helperText,
  label,
  placeholder,
  required = false,
  disabled = false,
  fullWidth = true,
  autoComplete,
  size = 'medium',
  inputProps,
}) => {
  // Memoized validation handler
  const handleValidation = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      const validation = handleInputValidation(event.target.value, type);
      if (!validation.isValid && onBlur) {
        onBlur(event);
      }
    },
    [type, onBlur]
  );

  // Memoized ARIA attributes for accessibility
  const ariaAttributes = useMemo(
    () => ({
      'aria-required': required,
      'aria-invalid': error,
      'aria-describedby': helperText ? `${id}-helper-text` : undefined,
    }),
    [required, error, helperText, id]
  );

  return (
    <StyledTextField
      name={name}
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      onBlur={handleValidation}
      error={error}
      helperText={helperText}
      label={label}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      fullWidth={fullWidth}
      autoComplete={autoComplete}
      size={size}
      InputProps={{
        ...ariaAttributes,
        ...inputProps,
      }}
      FormHelperTextProps={{
        id: `${id}-helper-text`,
      }}
    />
  );
};

export default Input;