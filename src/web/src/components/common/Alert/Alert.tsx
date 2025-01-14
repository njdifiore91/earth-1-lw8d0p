// External imports with version specifications
import React, { useEffect, useCallback } from 'react'; // ^18.2.0
import { useDispatch } from 'react-redux'; // ^8.0.5
import { Alert as MuiAlert } from '@mui/material'; // 5.x
import { IconButton } from '@mui/material'; // 5.x
import { Close } from '@mui/icons-material'; // 5.x

// Internal imports
import { uiActions } from '../../../store/slices/uiSlice';

/**
 * Default timeout duration for auto-hiding alerts in milliseconds
 */
const DEFAULT_TIMEOUT = 5000;

/**
 * Props interface for the Alert component
 */
interface AlertProps {
  /** Unique identifier for the alert instance */
  id: string;
  /** Alert severity level determining appearance and icon */
  type: 'success' | 'error' | 'warning' | 'info';
  /** Alert message content to be displayed */
  message: string;
  /** Flag to enable automatic dismissal */
  autoHide?: boolean;
  /** Duration in milliseconds before auto-dismissal */
  timeout?: number;
}

/**
 * Styles configuration following Material Design 3.0 spacing guidelines
 */
const ALERT_STYLES = {
  root: {
    marginBottom: '8px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    // Ensure minimum touch target size for accessibility
    minHeight: '48px',
    // Support for high contrast mode
    '@media (forced-colors: active)': {
      borderWidth: '2px',
    },
  },
  closeButton: {
    marginLeft: 'auto',
    padding: '4px',
    // Ensure minimum touch target size for accessibility
    minWidth: '48px',
    minHeight: '48px',
  },
} as const;

/**
 * Alert component for displaying notifications with accessibility support
 * and automatic dismissal functionality.
 * 
 * @component
 * @example
 * <Alert
 *   id="unique-id"
 *   type="success"
 *   message="Operation completed successfully"
 *   autoHide={true}
 *   timeout={5000}
 * />
 */
const Alert = React.memo<AlertProps>(({
  id,
  type,
  message,
  autoHide = true,
  timeout = DEFAULT_TIMEOUT,
}) => {
  const dispatch = useDispatch();

  /**
   * Memoized handler for alert dismissal
   */
  const handleClose = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dispatch(uiActions.removeAlert(id));
  }, [dispatch, id]);

  /**
   * Effect for handling automatic alert dismissal
   */
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (autoHide && timeout > 0) {
      timeoutId = setTimeout(() => {
        dispatch(uiActions.removeAlert(id));
      }, timeout);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [autoHide, dispatch, id, timeout]);

  return (
    <MuiAlert
      severity={type}
      sx={ALERT_STYLES.root}
      // Accessibility attributes
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      // Support for reduced motion preferences
      style={{
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
        },
      }}
      action={
        <IconButton
          aria-label="Close alert"
          color="inherit"
          size="large"
          onClick={handleClose}
          sx={ALERT_STYLES.closeButton}
          // Keyboard navigation support
          tabIndex={0}
          // Touch target size for accessibility
          TouchRippleProps={{
            center: false,
          }}
        >
          <Close fontSize="small" />
        </IconButton>
      }
    >
      {message}
    </MuiAlert>
  );
});

// Display name for debugging
Alert.displayName = 'Alert';

export default Alert;