// External imports
import { Auth0ClientOptions } from '@auth0/auth0-spa-js'; // ^2.1.0

// Internal imports
import { UserRole } from '../types/user.types';

/**
 * Comprehensive authentication and security configuration for the Matter platform
 */
export const authConfig = {
  /**
   * Auth0 configuration settings for OAuth 2.0 integration
   */
  auth0: {
    domain: process.env.VITE_AUTH0_DOMAIN as string,
    clientId: process.env.VITE_AUTH0_CLIENT_ID as string,
    audience: process.env.VITE_AUTH0_AUDIENCE as string,
    redirectUri: process.env.VITE_AUTH0_CALLBACK_URL as string,
    useRefreshTokens: true,
    cacheLocation: 'localstorage',
    allowedOrigins: (process.env.VITE_ALLOWED_ORIGINS as string).split(','),
    mfaEnabled: true,
    // Additional Auth0 SDK options
    advancedOptions: {
      defaultScope: 'openid profile email',
    },
    httpTimeoutMs: 10000,
    sessionCheckExpiryDays: 1,
  } as Auth0ClientOptions,

  /**
   * JWT token management configuration
   */
  jwt: {
    tokenKey: 'matter_access_token',
    refreshKey: 'matter_refresh_token',
    expiryKey: 'matter_token_expiry',
    accessTokenExpiry: 3600, // 1 hour in seconds
    refreshTokenExpiry: 604800, // 7 days in seconds
    rotateRefreshTokens: true,
    blacklistEnabled: true,
    algorithm: 'RS256',
    issuer: 'matter-platform',
    audience: 'matter-api',
    clockTolerance: 60, // 1 minute tolerance for time drift
  },

  /**
   * Enhanced security configuration settings
   */
  security: {
    sessionTimeout: 43200, // 12 hours in seconds
    inactivityTimeout: 1800, // 30 minutes in seconds
    maxLoginAttempts: 5,
    lockoutDuration: 900, // 15 minutes in seconds
    mfaRequired: true,
    passwordPolicy: {
      minLength: 12,
      requireSpecialChars: true,
      requireNumbers: true,
      requireUppercase: true,
      preventReuse: 5, // Number of previous passwords to check
      maxAge: 90, // Password expiry in days
      complexity: {
        minUniqueChars: 8,
        preventCommonWords: true,
        preventSequential: true,
      },
    },
    rateLimiting: {
      maxAttempts: 100,
      windowMs: 900000, // 15 minutes in milliseconds
      blockDuration: 3600000, // 1 hour in milliseconds
      headers: true, // Send rate limit headers
      skipSuccessfulRequests: false,
    },
    ipRestrictions: {
      enabled: true,
      allowedIPs: (process.env.VITE_ALLOWED_IPS as string)?.split(',') || [],
      blockListed: (process.env.VITE_BLOCKED_IPS as string)?.split(',') || [],
      enforceOnAdmin: true,
      logFailedAttempts: true,
    },
    headers: {
      hsts: true,
      noSniff: true,
      frameOptions: 'DENY',
      xssProtection: '1; mode=block',
      contentSecurityPolicy: {
        enabled: true,
        reportOnly: false,
      },
    },
  },

  /**
   * Role-based access control configuration
   */
  roles: {
    default: UserRole.CUSTOMER,
    available: [
      UserRole.CUSTOMER,
      UserRole.ADMIN,
      UserRole.SERVICE,
    ] as UserRole[],
    mfaRequired: [
      UserRole.ADMIN,
      UserRole.SERVICE,
    ] as UserRole[],
    ipRestricted: [
      UserRole.ADMIN,
      UserRole.SERVICE,
    ] as UserRole[],
    permissions: {
      [UserRole.CUSTOMER]: [
        'read',
        'write',
        'export_data',
      ],
      [UserRole.ADMIN]: [
        'read',
        'write',
        'admin',
        'manage_users',
        'view_analytics',
        'export_data',
      ],
      [UserRole.SERVICE]: [
        'read',
        'custom_api_access',
      ],
    },
    sessionPolicies: {
      [UserRole.CUSTOMER]: {
        maxSessions: 3,
        requireDeviceVerification: false,
      },
      [UserRole.ADMIN]: {
        maxSessions: 1,
        requireDeviceVerification: true,
      },
      [UserRole.SERVICE]: {
        maxSessions: 5,
        requireDeviceVerification: true,
      },
    },
  },
} as const;

/**
 * Type assertion to ensure configuration immutability
 */
Object.freeze(authConfig);
export type AuthConfig = typeof authConfig;