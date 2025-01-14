/**
 * Login Page Component for Matter Platform
 * Implements secure OAuth 2.0 authentication with Auth0 integration,
 * MFA support, and WCAG 2.1 Level AA compliance
 * @version 1.0.0
 */

// React v18.2.0
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

// Material UI v5.x
import { Container, Paper, Typography, CircularProgress, Alert } from '@mui/material';
import { styled } from '@mui/material/styles';

// Auth0 v2.0.0
import { useAuth0 } from '@auth0/auth0-react';

// FingerprintJS v3.4.0
import FingerprintJS from '@fingerprintjs/fingerprintjs';

// Internal imports
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import { login } from '../../store/slices/authSlice';

/**
 * Styled components with WCAG 2.1 Level AA compliance
 */
const StyledContainer = styled(Container)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: theme.spacing(3),
  backgroundColor: theme.palette.background.default,
}));

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  width: '100%',
  maxWidth: 480,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(3),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[3],
  position: 'relative',
  '&:focus-within': {
    outline: `3px solid ${theme.palette.primary.main}`,
    outlineOffset: '2px',
  },
}));

/**
 * Interface for login form state
 */
interface LoginFormState {
  email: string;
  password: string;
  mfaCode: string;
  errors: {
    email: string | null;
    password: string | null;
    mfa: string | null;
    general: string | null;
  };
  attempts: number;
  deviceFingerprint: string;
}

/**
 * Login component with enhanced security features and accessibility
 */
const Login: React.FC = React.memo(() => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loginWithRedirect, isAuthenticated, getAccessTokenSilently } = useAuth0();

  // Form state management
  const [formState, setFormState] = useState<LoginFormState>({
    email: '',
    password: '',
    mfaCode: '',
    errors: {
      email: null,
      password: null,
      mfa: null,
      general: null,
    },
    attempts: 0,
    deviceFingerprint: '',
  });

  const [loading, setLoading] = useState(false);
  const [showMfa, setShowMfa] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Initialize device fingerprint
  useEffect(() => {
    const initializeFingerprint = async () => {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      setFormState(prev => ({ ...prev, deviceFingerprint: result.visitorId }));
    };
    initializeFingerprint();
  }, []);

  // Handle form validation
  const validateForm = useCallback(() => {
    const errors = {
      email: null,
      password: null,
      mfa: null,
      general: null,
    };

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!formState.email) {
      errors.email = 'Email is required';
    } else if (!emailRegex.test(formState.email)) {
      errors.email = 'Invalid email format';
    }

    if (!formState.password) {
      errors.password = 'Password is required';
    } else if (formState.password.length < 12) {
      errors.password = 'Password must be at least 12 characters';
    }

    if (showMfa && !formState.mfaCode) {
      errors.mfa = 'MFA code is required';
    }

    setFormState(prev => ({ ...prev, errors }));
    return !Object.values(errors).some(error => error !== null);
  }, [formState.email, formState.password, formState.mfaCode, showMfa]);

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (formState.attempts >= 5) {
      setFormState(prev => ({
        ...prev,
        errors: {
          ...prev.errors,
          general: 'Too many login attempts. Please try again later.',
        },
      }));
      return;
    }

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const response = await dispatch(login({
        email: formState.email,
        password: formState.password,
        mfaCode: formState.mfaCode,
        deviceFingerprint: formState.deviceFingerprint,
      }));

      if (response.payload?.mfaRequired) {
        setShowMfa(true);
        return;
      }

      const token = await getAccessTokenSilently();
      if (token) {
        navigate('/dashboard');
      }
    } catch (error) {
      setFormState(prev => ({
        ...prev,
        attempts: prev.attempts + 1,
        errors: {
          ...prev.errors,
          general: 'Invalid credentials or authentication failed',
        },
      }));
    } finally {
      setLoading(false);
    }
  };

  // Handle input changes
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormState(prev => ({
      ...prev,
      [name]: value,
      errors: {
        ...prev.errors,
        [name]: null,
        general: null,
      },
    }));
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  return (
    <StyledContainer>
      <StyledPaper
        component="form"
        onSubmit={handleSubmit}
        ref={formRef}
        role="form"
        aria-label="Login form"
      >
        <Typography
          variant="h1"
          component="h1"
          align="center"
          gutterBottom
          sx={{ fontSize: '2rem', fontWeight: 500 }}
        >
          Sign in to Matter
        </Typography>

        {formState.errors.general && (
          <Alert 
            severity="error" 
            aria-live="polite"
            sx={{ mb: 2 }}
          >
            {formState.errors.general}
          </Alert>
        )}

        <Input
          id="email"
          name="email"
          type="email"
          label="Email"
          value={formState.email}
          onChange={handleInputChange}
          error={!!formState.errors.email}
          helperText={formState.errors.email}
          required
          autoComplete="email"
          disabled={loading}
          aria-describedby="email-error"
        />

        <Input
          id="password"
          name="password"
          type="password"
          label="Password"
          value={formState.password}
          onChange={handleInputChange}
          error={!!formState.errors.password}
          helperText={formState.errors.password}
          required
          autoComplete="current-password"
          disabled={loading}
          aria-describedby="password-error"
        />

        {showMfa && (
          <Input
            id="mfaCode"
            name="mfaCode"
            type="text"
            label="MFA Code"
            value={formState.mfaCode}
            onChange={handleInputChange}
            error={!!formState.errors.mfa}
            helperText={formState.errors.mfa}
            required
            autoComplete="one-time-code"
            disabled={loading}
            aria-describedby="mfa-error"
          />
        )}

        <Button
          type="submit"
          disabled={loading}
          loading={loading}
          fullWidth
          size="large"
          color="primary"
          variant="contained"
          aria-label={loading ? 'Signing in...' : 'Sign in'}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>

        <Button
          type="button"
          fullWidth
          size="large"
          variant="outlined"
          onClick={() => loginWithRedirect()}
          disabled={loading}
          aria-label="Sign in with SSO"
        >
          Sign in with SSO
        </Button>
      </StyledPaper>
    </StyledContainer>
  );
});

Login.displayName = 'Login';

export default Login;