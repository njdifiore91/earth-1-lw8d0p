// React v18.2.0
import React from 'react';
// @mui/material v5.x
import { Button as MuiButton } from '@mui/material';
import { styled } from '@mui/material/styles';
import CircularProgress from '@mui/material/CircularProgress';

// Internal imports
import { defaultTheme } from '../../config/theme.config';

/**
 * Props interface for the Button component with enhanced accessibility and theme support
 */
export interface ButtonProps {
  variant?: 'contained' | 'outlined' | 'text';
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  ariaLabel?: string;
}

/**
 * Enhanced styled button with comprehensive theme integration
 */
const StyledButton = styled(MuiButton)(({ theme, size, color, variant }) => ({
  // Size-specific padding following 8px grid system
  padding: size === 'small' 
    ? theme.spacing(1, 2)
    : size === 'large'
      ? theme.spacing(2, 4)
      : theme.spacing(1.5, 3),

  // Minimum touch target size for accessibility
  minHeight: size === 'small' ? 36 : size === 'large' ? 48 : 40,
  minWidth: size === 'small' ? 64 : size === 'large' ? 96 : 80,

  // Enhanced focus state for accessibility
  '&:focus-visible': {
    outline: `3px solid ${theme.palette[color || 'primary'].main}`,
    outlineOffset: '2px',
  },

  // Loading state styles
  '&.loading': {
    position: 'relative',
    '& .MuiCircularProgress-root': {
      position: 'absolute',
      left: '50%',
      top: '50%',
      marginLeft: -12,
      marginTop: -12,
    },
    '& .button-content': {
      visibility: 'hidden',
    },
  },

  // Icon spacing
  '& .MuiButton-startIcon': {
    marginRight: theme.spacing(1),
  },
  '& .MuiButton-endIcon': {
    marginLeft: theme.spacing(1),
  },

  // Enhanced disabled state
  '&.Mui-disabled': {
    opacity: 0.6,
    cursor: 'not-allowed',
  },

  // High contrast ratio enforcement
  ...(variant === 'contained' && {
    color: theme.palette[color || 'primary'].contrastText,
  }),

  // Transition effects
  transition: theme.transitions?.create(['background-color', 'box-shadow', 'border-color', 'color'], {
    duration: theme.transitions?.duration?.short,
  }),

  // RTL support
  '&[dir="rtl"]': {
    '& .MuiButton-startIcon': {
      marginLeft: theme.spacing(1),
      marginRight: 0,
    },
    '& .MuiButton-endIcon': {
      marginRight: theme.spacing(1),
      marginLeft: 0,
    },
  },
}));

/**
 * Optimized button component with enhanced theme integration and accessibility
 */
export const Button = React.memo<ButtonProps>(({
  variant = 'contained',
  color = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  startIcon,
  endIcon,
  onClick,
  children,
  ariaLabel,
}) => {
  // Event throttling for click handlers
  const handleClick = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !loading && onClick) {
      onClick(event);
    }
  }, [disabled, loading, onClick]);

  return (
    <StyledButton
      variant={variant}
      color={color}
      size={size}
      disabled={disabled || loading}
      onClick={handleClick}
      className={loading ? 'loading' : ''}
      startIcon={!loading && startIcon}
      endIcon={!loading && endIcon}
      // Comprehensive ARIA attributes
      aria-label={ariaLabel}
      aria-disabled={disabled || loading}
      aria-busy={loading}
      role="button"
      // Touch target optimization
      tabIndex={disabled ? -1 : 0}
    >
      <span className="button-content">
        {children}
      </span>
      {loading && (
        <CircularProgress
          size={24}
          color={color}
          aria-label="Loading"
        />
      )}
    </StyledButton>
  );
});

// Display name for debugging
Button.displayName = 'Button';

export default Button;