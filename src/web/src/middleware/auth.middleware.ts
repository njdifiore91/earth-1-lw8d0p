/**
 * Authentication Middleware for Matter Satellite Data Product Matching Platform
 * @version 1.0.0
 * Implements enterprise-grade route protection with OAuth 2.0, MFA validation,
 * and enhanced security features including IP restrictions and session management
 */

// External imports
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom'; // ^6.0.0

// Internal imports
import AuthService from '../services/auth.service';
import { authConfig } from '../config/auth.config';
import { UserRole } from '../types/user.types';

// Constants for session and security management
const SESSION_STORAGE_KEY = 'matter_last_activity';
const TOKEN_ROTATION_INTERVAL = 3600000; // 1 hour in milliseconds
const INACTIVITY_TIMEOUT = 1800000; // 30 minutes in milliseconds

// Security event types for logging
const SECURITY_EVENT_TYPES = {
  AUTH_SUCCESS: 'auth_success',
  AUTH_FAILURE: 'auth_failure',
  MFA_REQUIRED: 'mfa_required',
  IP_RESTRICTED: 'ip_restricted',
  SESSION_EXPIRED: 'session_expired',
  TOKEN_ROTATED: 'token_rotated'
} as const;

/**
 * Higher-order component that protects routes requiring authentication
 * Implements comprehensive security checks including MFA and IP restrictions
 */
export const requireAuth = <P extends object>(
  WrappedComponent: React.ComponentType<P>
): React.ComponentType<P> => {
  return function WithAuthProtection(props: P) {
    const navigate = useNavigate();
    const [isAuthorized, setIsAuthorized] = useState(false);
    const authService = AuthService.getInstance();

    useEffect(() => {
      const validateAuth = async () => {
        try {
          // Check if user is authenticated
          const currentUser = await authService.getCurrentUser();
          if (!currentUser) {
            navigate('/login');
            return;
          }

          // Validate session
          const isSessionValid = await validateSession();
          if (!isSessionValid) {
            navigate('/login');
            return;
          }

          // Check MFA requirements
          if (authConfig.security.mfaRequired && !await authService.validateMFA()) {
            navigate('/mfa');
            return;
          }

          // Validate IP restrictions
          if (authConfig.ipRestrictions.enabled) {
            const clientIP = await fetch('https://api.ipify.org?format=json')
              .then(res => res.json())
              .then(data => data.ip);

            const isAllowedIP = authConfig.ipRestrictions.allowedIPs.includes(clientIP) &&
                              !authConfig.ipRestrictions.blockListed.includes(clientIP);

            if (!isAllowedIP) {
              authService.handleSecurityEvent({
                type: 'security_violation',
                userId: currentUser.id,
                details: { event: SECURITY_EVENT_TYPES.IP_RESTRICTED, ip: clientIP }
              });
              navigate('/unauthorized');
              return;
            }
          }

          // Handle token rotation if needed
          const lastRotation = localStorage.getItem('matter_token_rotation');
          if (!lastRotation || Date.now() - Number(lastRotation) >= TOKEN_ROTATION_INTERVAL) {
            await authService.rotateToken();
            localStorage.setItem('matter_token_rotation', Date.now().toString());
          }

          setIsAuthorized(true);

        } catch (error) {
          console.error('Authentication validation failed:', error);
          navigate('/login');
        }
      };

      validateAuth();
    }, [navigate]);

    return isAuthorized ? <WrappedComponent {...props} /> : null;
  };
};

/**
 * Higher-order component that protects routes requiring specific user roles
 * Implements progressive security policies based on role sensitivity
 */
export const requireRole = <P extends object>(
  allowedRoles: UserRole[],
  WrappedComponent: React.ComponentType<P>
): React.ComponentType<P> => {
  return function WithRoleProtection(props: P) {
    const navigate = useNavigate();
    const [isAuthorized, setIsAuthorized] = useState(false);
    const authService = AuthService.getInstance();

    useEffect(() => {
      const validateRole = async () => {
        try {
          const currentUser = await authService.getCurrentUser();
          if (!currentUser) {
            navigate('/login');
            return;
          }

          // Validate user role
          if (!allowedRoles.includes(currentUser.role)) {
            navigate('/unauthorized');
            return;
          }

          // Enhanced security for sensitive roles
          if ([UserRole.ADMIN, UserRole.SERVICE].includes(currentUser.role)) {
            // Enforce MFA for sensitive roles
            if (!await authService.validateMFA()) {
              navigate('/mfa');
              return;
            }

            // Strict IP restrictions for sensitive roles
            if (authConfig.roles.ipRestricted.includes(currentUser.role)) {
              const clientIP = await fetch('https://api.ipify.org?format=json')
                .then(res => res.json())
                .then(data => data.ip);

              if (!authConfig.ipRestrictions.allowedIPs.includes(clientIP)) {
                navigate('/unauthorized');
                return;
              }
            }
          }

          setIsAuthorized(true);

        } catch (error) {
          console.error('Role validation failed:', error);
          navigate('/unauthorized');
        }
      };

      validateRole();
    }, [navigate]);

    return isAuthorized ? <WrappedComponent {...props} /> : null;
  };
};

/**
 * Validates current session with comprehensive security checks
 * Implements timeout management and security event logging
 */
export const validateSession = async (): Promise<boolean> => {
  try {
    const lastActivity = sessionStorage.getItem(SESSION_STORAGE_KEY);
    const currentTime = Date.now();

    // Check session timeout
    if (!lastActivity || currentTime - Number(lastActivity) > INACTIVITY_TIMEOUT) {
      const authService = AuthService.getInstance();
      const currentUser = await authService.getCurrentUser();

      if (currentUser) {
        authService.handleSecurityEvent({
          type: 'session_validation',
          userId: currentUser.id,
          details: { event: SECURITY_EVENT_TYPES.SESSION_EXPIRED }
        });
      }

      return false;
    }

    // Update last activity timestamp
    sessionStorage.setItem(SESSION_STORAGE_KEY, currentTime.toString());

    return true;
  } catch (error) {
    console.error('Session validation failed:', error);
    return false;
  }
};