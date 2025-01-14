// @package express ^4.18.2
// @package http-errors ^2.0.0
// @package express-rate-limit ^6.7.0
import { Request, Response, NextFunction } from 'express';
import createHttpError from 'http-errors';
import rateLimit from 'express-rate-limit';
import { authConfig } from '../config/auth.config';
import { verifyToken, decodeToken } from '../utils/jwt.utils';
import { AuthRequest, UserRole } from '../interfaces/auth.interface';

/**
 * Authentication error messages implementing standardized error handling
 */
const AUTH_ERRORS = {
    NO_TOKEN: 'No authentication token provided',
    INVALID_TOKEN: 'Invalid or malformed authentication token',
    BLACKLISTED_TOKEN: 'Token has been revoked',
    SESSION_EXPIRED: 'Session has expired due to timeout',
    INSUFFICIENT_ROLE: 'Insufficient role permissions for access',
    INVALID_SESSION: 'Invalid or corrupted session state',
    RATE_LIMIT_EXCEEDED: 'Too many authentication attempts'
} as const;

/**
 * Rate limiter middleware implementing brute force protection
 */
export const authRateLimiter = rateLimit({
    windowMs: authConfig.security.rateLimiting.windowMs,
    max: authConfig.security.rateLimiting.maxAttempts,
    message: AUTH_ERRORS.RATE_LIMIT_EXCEEDED,
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * JWT token authentication middleware with enhanced security features
 * Implements comprehensive token validation and session management
 */
export const authenticateToken = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw createHttpError(401, AUTH_ERRORS.NO_TOKEN);
        }

        const token = authHeader.split(' ')[1];

        // Verify token validity and signature
        await verifyToken(token);

        // Decode and validate token payload
        const decodedToken = await decodeToken(token);

        // Attach user information to request
        (req as AuthRequest).user = {
            id: decodedToken.userId,
            email: decodedToken.email,
            role: decodedToken.role,
            lastLogin: new Date(decodedToken.iat * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
            status: 'active',
            passwordHash: '', // Excluded for security
            preferences: {}
        };

        // Log authentication for audit trail
        console.info(`Authenticated user ${decodedToken.email} with role ${decodedToken.role}`);

        next();
    } catch (error) {
        console.error('Authentication failed:', error);
        next(createHttpError(401, AUTH_ERRORS.INVALID_TOKEN));
    }
};

/**
 * Role-based access control middleware factory with audit logging
 * Implements strict role validation and access control
 */
export const requireRole = (allowedRoles: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            const authReq = req as AuthRequest;

            // Verify user object exists
            if (!authReq.user) {
                throw createHttpError(401, AUTH_ERRORS.INVALID_SESSION);
            }

            // Validate user role
            if (!allowedRoles.includes(authReq.user.role)) {
                console.warn(
                    `Access denied for user ${authReq.user.email} with role ${authReq.user.role}`
                );
                throw createHttpError(403, AUTH_ERRORS.INSUFFICIENT_ROLE);
            }

            // Log successful role validation
            console.info(
                `Role validation passed for user ${authReq.user.email} with role ${authReq.user.role}`
            );

            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Session validation middleware implementing timeout and activity checks
 * Implements comprehensive session security measures
 */
export const validateSession = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authReq = req as AuthRequest;

        // Verify user session exists
        if (!authReq.user) {
            throw createHttpError(401, AUTH_ERRORS.INVALID_SESSION);
        }

        // Check absolute session timeout
        const sessionStart = authReq.user.lastLogin.getTime();
        const absoluteTimeout = new Date(sessionStart + 
            parseTimeToMs(authConfig.oauth.sessionManagement.absoluteTimeout));

        if (Date.now() > absoluteTimeout.getTime()) {
            throw createHttpError(401, AUTH_ERRORS.SESSION_EXPIRED);
        }

        // Check inactivity timeout
        const lastActivity = req.session?.lastActivity || sessionStart;
        const inactivityTimeout = new Date(lastActivity + 
            parseTimeToMs(authConfig.oauth.sessionManagement.inactivityTimeout));

        if (Date.now() > inactivityTimeout.getTime()) {
            throw createHttpError(401, AUTH_ERRORS.SESSION_EXPIRED);
        }

        // Update last activity timestamp
        if (req.session) {
            req.session.lastActivity = Date.now();
        }

        // Log session validation
        console.info(`Session validated for user ${authReq.user.email}`);

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Utility function to parse time strings to milliseconds
 * @param timeString Time string in format '1h', '30m', etc.
 */
const parseTimeToMs = (timeString: string): number => {
    const value = parseInt(timeString);
    const unit = timeString.slice(-1);
    
    switch (unit) {
        case 'h': return value * 60 * 60 * 1000;
        case 'm': return value * 60 * 1000;
        case 's': return value * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return value;
    }
};