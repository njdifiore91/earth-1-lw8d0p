// express v4.18.2
import { Request, Response, NextFunction, RequestHandler } from 'express';
// jsonwebtoken v9.0.0
import jwt, { JwtPayload, TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import { gatewayConfig } from '../config/gateway.config';
import { ApiError, ERROR_CODES, DEFAULT_ERROR_MESSAGES } from '../utils/error.utils';

// Token blacklist cache (in production, use Redis)
const tokenBlacklist = new Set<string>();

// Extended request interface with authenticated user data
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
    sessionData: Record<string, unknown>;
  };
  securityContext?: {
    tokenExp: number;
    issuer: string;
    scope: string[];
  };
}

// JWT token payload interface
interface TokenPayload extends JwtPayload {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  iss: string;
  aud: string;
  jti: string;
}

// Authorization options interface
interface AuthorizationOptions {
  requireAllPermissions?: boolean;
  resourceAccess?: string[];
  customValidation?: (req: AuthenticatedRequest) => boolean | Promise<boolean>;
}

/**
 * JWT Authentication middleware
 * Validates tokens using RS256 algorithm and implements comprehensive security checks
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new ApiError(
        DEFAULT_ERROR_MESSAGES.AUTHENTICATION,
        StatusCodes.UNAUTHORIZED,
        ERROR_CODES.AUTHENTICATION_ERROR
      );
    }

    const token = authHeader.split(' ')[1].trim();

    // Check token blacklist
    if (tokenBlacklist.has(token)) {
      throw new ApiError(
        'Token has been revoked',
        StatusCodes.UNAUTHORIZED,
        ERROR_CODES.AUTHENTICATION_ERROR
      );
    }

    // Verify token
    const decoded = jwt.verify(token, gatewayConfig.security.jwtSecret, {
      algorithms: ['RS256'],
      issuer: 'matter-platform',
      audience: 'matter-api',
      complete: true
    }) as { payload: TokenPayload };

    // Validate token payload structure
    const payload = decoded.payload;
    if (!payload.id || !payload.email || !payload.role) {
      throw new ApiError(
        'Invalid token payload',
        StatusCodes.UNAUTHORIZED,
        ERROR_CODES.AUTHENTICATION_ERROR
      );
    }

    // Attach user data to request
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions || [],
      sessionData: {}
    };

    // Add security context
    req.securityContext = {
      tokenExp: payload.exp!,
      issuer: payload.iss!,
      scope: payload.permissions
    };

    // Check token expiration with buffer
    const expirationBuffer = 60; // 1 minute buffer
    if (payload.exp && Date.now() >= (payload.exp - expirationBuffer) * 1000) {
      throw new ApiError(
        'Token is about to expire',
        StatusCodes.UNAUTHORIZED,
        ERROR_CODES.AUTHENTICATION_ERROR
      );
    }

    next();
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      next(new ApiError(
        'Token has expired',
        StatusCodes.UNAUTHORIZED,
        ERROR_CODES.AUTHENTICATION_ERROR
      ));
    } else if (error instanceof JsonWebTokenError) {
      next(new ApiError(
        'Invalid token',
        StatusCodes.UNAUTHORIZED,
        ERROR_CODES.AUTHENTICATION_ERROR
      ));
    } else {
      next(error);
    }
  }
};

/**
 * Role-based authorization middleware factory
 * Supports granular permission checking and custom validation rules
 */
export const authorizeRole = (
  allowedRoles: string[],
  options: AuthorizationOptions = {}
): RequestHandler => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Verify authenticated request
      if (!req.user) {
        throw new ApiError(
          'Authentication required',
          StatusCodes.UNAUTHORIZED,
          ERROR_CODES.AUTHORIZATION_ERROR
        );
      }

      // Check role authorization
      if (!allowedRoles.includes(req.user.role)) {
        throw new ApiError(
          'Insufficient permissions',
          StatusCodes.FORBIDDEN,
          ERROR_CODES.AUTHORIZATION_ERROR
        );
      }

      // Validate specific permissions if required
      if (options.resourceAccess && options.resourceAccess.length > 0) {
        const hasRequiredPermissions = options.requireAllPermissions
          ? options.resourceAccess.every(permission => 
              req.user!.permissions.includes(permission))
          : options.resourceAccess.some(permission => 
              req.user!.permissions.includes(permission));

        if (!hasRequiredPermissions) {
          throw new ApiError(
            'Insufficient resource permissions',
            StatusCodes.FORBIDDEN,
            ERROR_CODES.AUTHORIZATION_ERROR
          );
        }
      }

      // Execute custom validation if provided
      if (options.customValidation) {
        const isValid = await options.customValidation(req);
        if (!isValid) {
          throw new ApiError(
            'Custom validation failed',
            StatusCodes.FORBIDDEN,
            ERROR_CODES.AUTHORIZATION_ERROR
          );
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Token revocation helper
 * Adds token to blacklist (in production, use Redis with TTL)
 */
export const revokeToken = (token: string): void => {
  tokenBlacklist.add(token);
};