/**
 * Authentication Slice for Matter Platform
 * @version 1.0.0
 * Implements enterprise-grade authentication state management with
 * enhanced security features, session monitoring, and MFA support
 */

// External imports - @reduxjs/toolkit ^1.9.5
import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';

// Internal imports
import { User, UserRole, AuthState, LoginCredentials, MFAState, SecurityEvent } from '../../types/user.types';
import { AuthService } from '../../services/auth.service';

/**
 * Enhanced session information interface
 */
interface SessionInfo {
  lastActivity: number | null;
  expiresAt: number | null;
  deviceId: string | null;
  ipAddress: string | null;
}

/**
 * Enhanced authentication error interface
 */
interface AuthError {
  code: string;
  message: string;
  timestamp: string;
  attempts?: number;
}

/**
 * Constants for authentication management
 */
const SESSION_MONITOR_INTERVAL = 60000; // 1 minute
const TOKEN_REFRESH_THRESHOLD = 300000; // 5 minutes
const MAX_LOGIN_ATTEMPTS = 3;

/**
 * Initial state with enhanced security features
 */
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,
  sessionInfo: {
    lastActivity: null,
    expiresAt: null,
    deviceId: null,
    ipAddress: null
  },
  mfaState: {
    required: false,
    verified: false,
    challengeType: null
  },
  securityEvents: []
};

/**
 * Enhanced login thunk with MFA support and security monitoring
 */
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: LoginCredentials, { rejectWithValue, dispatch }) => {
    try {
      const authService = new AuthService();
      
      // Attempt login
      const response = await authService.login(credentials);
      
      // Handle MFA challenge if required
      if (response.mfaRequired) {
        dispatch(setMFARequired({
          required: true,
          challengeType: response.mfaType
        }));
        return rejectWithValue({ code: 'MFA_REQUIRED' });
      }

      // Initialize session monitoring
      dispatch(startSessionMonitoring());

      return response;
    } catch (error: any) {
      return rejectWithValue({
        code: error.code || 'AUTH_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * Enhanced logout thunk with security cleanup
 */
export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { dispatch }) => {
    const authService = new AuthService();
    
    try {
      await authService.logout();
      dispatch(stopSessionMonitoring());
      
      // Log security event
      dispatch(addSecurityEvent({
        type: 'logout',
        timestamp: new Date().toISOString(),
        details: { reason: 'user_initiated' }
      }));
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
);

/**
 * Session monitoring thunk
 */
export const monitorSession = createAsyncThunk(
  'auth/monitorSession',
  async (_, { dispatch, getState }) => {
    const authService = new AuthService();
    
    try {
      const isValid = await authService.validateSession();
      
      if (!isValid) {
        dispatch(logout());
        return false;
      }

      // Check token expiration
      const { sessionInfo } = (getState() as any).auth;
      if (sessionInfo.expiresAt && 
          sessionInfo.expiresAt - Date.now() < TOKEN_REFRESH_THRESHOLD) {
        const newToken = await authService.refreshTokenWithRotation();
        dispatch(updateSessionToken(newToken));
      }

      return true;
    } catch (error) {
      dispatch(logout());
      return false;
    }
  }
);

/**
 * Authentication slice with enhanced security features
 */
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setMFARequired: (state, action: PayloadAction<Partial<MFAState>>) => {
      state.mfaState = {
        ...state.mfaState,
        ...action.payload
      };
    },
    
    updateSessionInfo: (state, action: PayloadAction<Partial<SessionInfo>>) => {
      state.sessionInfo = {
        ...state.sessionInfo,
        ...action.payload,
        lastActivity: Date.now()
      };
    },
    
    updateSessionToken: (state, action: PayloadAction<string>) => {
      state.sessionInfo.expiresAt = Date.now() + TOKEN_REFRESH_THRESHOLD;
    },
    
    addSecurityEvent: (state, action: PayloadAction<SecurityEvent>) => {
      state.securityEvents = [
        ...state.securityEvents,
        action.payload
      ].slice(-50); // Keep last 50 events
    },
    
    clearAuthError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Login cases
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.sessionInfo = {
          lastActivity: Date.now(),
          expiresAt: Date.now() + (action.payload.expiresIn * 1000),
          deviceId: action.payload.deviceId,
          ipAddress: action.payload.ipAddress
        };
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as AuthError;
        if (state.error.code !== 'MFA_REQUIRED') {
          state.isAuthenticated = false;
          state.user = null;
        }
      })
      
      // Logout cases
      .addCase(logout.fulfilled, (state) => {
        return { ...initialState };
      })
      
      // Session monitoring cases
      .addCase(monitorSession.rejected, (state) => {
        return { ...initialState };
      });
  }
});

// Export actions
export const {
  setMFARequired,
  updateSessionInfo,
  updateSessionToken,
  addSecurityEvent,
  clearAuthError
} = authSlice.actions;

// Export reducer
export default authSlice.reducer;

// Export session monitoring functions
let sessionMonitorInterval: NodeJS.Timeout;

export const startSessionMonitoring = () => (dispatch: any) => {
  sessionMonitorInterval = setInterval(
    () => dispatch(monitorSession()),
    SESSION_MONITOR_INTERVAL
  );
};

export const stopSessionMonitoring = () => {
  if (sessionMonitorInterval) {
    clearInterval(sessionMonitorInterval);
  }
};