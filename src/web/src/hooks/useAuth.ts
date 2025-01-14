/**
 * Enhanced Authentication Hook for Matter Platform
 * @version 1.0.0
 * Implements enterprise-grade authentication state management with
 * comprehensive security features, MFA support, and session monitoring
 */

// External imports
import { useDispatch, useSelector } from 'react-redux'; // ^8.1.0
import { useCallback, useEffect } from 'react'; // ^18.2.0

// Internal imports
import { User } from '../types/user.types';
import { 
  login, 
  logout, 
  selectAuth,
  monitorSession,
  startSessionMonitoring,
  stopSessionMonitoring,
  updateSessionInfo,
  addSecurityEvent
} from '../store/slices/authSlice';

// Constants
const SESSION_CHECK_INTERVAL = 60000; // 1 minute
const SUSPICIOUS_ACTIVITY_THRESHOLD = 3;

/**
 * Enhanced authentication hook with comprehensive security features
 */
export const useAuth = () => {
  const dispatch = useDispatch();
  const authState = useSelector(selectAuth);

  /**
   * Initialize session monitoring on mount
   */
  useEffect(() => {
    if (authState.isAuthenticated) {
      dispatch(startSessionMonitoring());

      // Update session activity periodically
      const activityInterval = setInterval(() => {
        dispatch(updateSessionInfo({ lastActivity: Date.now() }));
      }, SESSION_CHECK_INTERVAL);

      return () => {
        clearInterval(activityInterval);
        dispatch(stopSessionMonitoring());
      };
    }
  }, [authState.isAuthenticated, dispatch]);

  /**
   * Enhanced login handler with MFA support and security monitoring
   */
  const handleLogin = useCallback(async (
    email: string, 
    password: string, 
    mfaCode?: string
  ) => {
    try {
      const result = await dispatch(login({ 
        email, 
        password, 
        mfaCode,
        deviceInfo: {
          userAgent: navigator.userAgent,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator.language
        }
      })).unwrap();

      // Log successful login attempt
      dispatch(addSecurityEvent({
        type: 'login',
        timestamp: new Date().toISOString(),
        details: {
          success: true,
          email,
          deviceInfo: result.deviceId
        }
      }));

      return result;
    } catch (error: any) {
      // Log failed login attempt
      dispatch(addSecurityEvent({
        type: 'login',
        timestamp: new Date().toISOString(),
        details: {
          success: false,
          email,
          error: error.message
        }
      }));

      // Check for suspicious activity
      if (authState.securityEvents?.filter(
        event => event.type === 'login' && !event.details.success
      ).length >= SUSPICIOUS_ACTIVITY_THRESHOLD) {
        dispatch(addSecurityEvent({
          type: 'security_violation',
          timestamp: new Date().toISOString(),
          details: {
            reason: 'multiple_failed_attempts',
            email
          }
        }));
      }

      throw error;
    }
  }, [dispatch, authState.securityEvents]);

  /**
   * Enhanced logout handler with security cleanup
   */
  const handleLogout = useCallback(async () => {
    try {
      await dispatch(logout()).unwrap();
      
      // Log successful logout
      dispatch(addSecurityEvent({
        type: 'logout',
        timestamp: new Date().toISOString(),
        details: {
          success: true,
          userId: authState.user?.id
        }
      }));
    } catch (error) {
      console.error('Logout error:', error);
      
      // Log failed logout attempt
      dispatch(addSecurityEvent({
        type: 'logout',
        timestamp: new Date().toISOString(),
        details: {
          success: false,
          userId: authState.user?.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }));
    }
  }, [dispatch, authState.user]);

  /**
   * Validate current session status
   */
  const validateSession = useCallback(async (): Promise<boolean> => {
    try {
      const result = await dispatch(monitorSession()).unwrap();
      
      if (!result) {
        dispatch(addSecurityEvent({
          type: 'session_validation',
          timestamp: new Date().toISOString(),
          details: {
            success: false,
            reason: 'invalid_session'
          }
        }));
      }

      return result;
    } catch (error) {
      dispatch(addSecurityEvent({
        type: 'session_validation',
        timestamp: new Date().toISOString(),
        details: {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }));
      return false;
    }
  }, [dispatch]);

  /**
   * Token refresh handler with security monitoring
   */
  const refreshToken = useCallback(async (): Promise<void> => {
    try {
      await dispatch(monitorSession()).unwrap();
      
      dispatch(addSecurityEvent({
        type: 'token_refresh',
        timestamp: new Date().toISOString(),
        details: {
          success: true,
          userId: authState.user?.id
        }
      }));
    } catch (error) {
      dispatch(addSecurityEvent({
        type: 'token_refresh',
        timestamp: new Date().toISOString(),
        details: {
          success: false,
          userId: authState.user?.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }));
      throw error;
    }
  }, [dispatch, authState.user]);

  return {
    user: authState.user,
    isAuthenticated: authState.isAuthenticated,
    loading: authState.loading,
    error: authState.error,
    mfaRequired: authState.mfaState?.required,
    sessionExpiry: authState.sessionInfo?.expiresAt,
    login: handleLogin,
    logout: handleLogout,
    validateSession,
    refreshToken
  };
};

export default useAuth;