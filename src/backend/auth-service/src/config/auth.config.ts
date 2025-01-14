// @package dotenv ^16.0.3
import { config } from 'dotenv';
import { UserRole } from '../interfaces/auth.interface';

// Initialize environment variables
config();

/**
 * Comprehensive authentication configuration object implementing enterprise-grade
 * security standards and multi-layered authentication mechanisms.
 */
export const authConfig = {
    /**
     * JWT configuration implementing secure token management with RS256 algorithm
     * and comprehensive validation parameters
     */
    jwt: {
        secretKey: process.env.JWT_SECRET_KEY,
        algorithm: 'RS256' as const,
        accessTokenExpiry: '1h',
        refreshTokenExpiry: '7d',
        issuer: 'matter-platform',
        audience: 'matter-api',
        clockTolerance: 30, // Seconds of clock drift tolerance
        jwtid: true, // Enable unique token ID
        notBefore: true, // Enable token activation time
    },

    /**
     * OAuth 2.0 configuration with Auth0 integration and secure session management
     * implementing industry standard authentication flows
     */
    oauth: {
        auth0: {
            domain: process.env.AUTH0_DOMAIN,
            clientId: process.env.AUTH0_CLIENT_ID,
            clientSecret: process.env.AUTH0_CLIENT_SECRET,
            callbackUrl: process.env.AUTH0_CALLBACK_URL,
            tokenEndpointAuthMethod: 'client_secret_post',
            responseType: 'code',
            grantType: 'authorization_code',
        },
        scopes: ['openid', 'profile', 'email'],
        sessionManagement: {
            absoluteTimeout: '12h',
            inactivityTimeout: '30m',
            rememberMeDuration: '30d',
        },
    },

    /**
     * Multi-Factor Authentication (MFA) configuration implementing TOTP-based
     * second factor authentication with backup and recovery options
     */
    mfa: {
        enabled: true,
        type: 'TOTP',
        issuer: 'Matter Platform',
        digits: 6,
        window: 1, // Time steps to check before/after current time
        algorithm: 'SHA256',
        period: 30, // TOTP token validity period in seconds
        backupCodes: 10,
        recoveryOptions: {
            enabled: true,
            codes: 8,
            length: 10,
        },
    },

    /**
     * Enhanced security parameters implementing strict password policies,
     * brute force protection, and secure headers
     */
    security: {
        passwordMinLength: 12,
        passwordRequireUppercase: true,
        passwordRequireNumbers: true,
        passwordRequireSpecialChars: true,
        passwordHistory: 5, // Number of previous passwords to prevent reuse
        maxLoginAttempts: 5,
        lockoutDuration: '15m',
        sessionTimeout: '12h',
        rateLimiting: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            maxAttempts: 100,
        },
        headers: {
            hsts: true,
            noSniff: true,
            frameGuard: 'deny',
            xssFilter: true,
        },
    },

    /**
     * Role-Based Access Control (RBAC) configuration implementing
     * strict permission hierarchies and access controls
     */
    roles: {
        default: UserRole.CUSTOMER,
        available: [UserRole.CUSTOMER, UserRole.ADMIN],
        permissions: {
            [UserRole.CUSTOMER]: ['read:own', 'write:own'],
            [UserRole.ADMIN]: ['read:all', 'write:all', 'manage:users'],
        },
    },
} as const;

// Type assertion to ensure configuration immutability
export type AuthConfig = typeof authConfig;