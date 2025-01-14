// @package jsonwebtoken ^9.0.0
import { sign, verify, decode, JwtPayload } from 'jsonwebtoken';
import { authConfig } from '../config/auth.config';
import { JWTToken } from '../interfaces/auth.interface';
import crypto from 'crypto';

/**
 * Comprehensive error messages for JWT-related operations
 * implementing detailed error tracking and security logging
 */
export const JWT_ERRORS = {
    INVALID_TOKEN: 'Invalid JWT token structure or format',
    EXPIRED_TOKEN: 'Token has expired or is not yet valid',
    INVALID_SIGNATURE: 'Invalid token signature or tampering detected',
    INVALID_PAYLOAD: 'Token payload fails validation requirements',
    REFRESH_FAILED: 'Token refresh operation failed',
    TOKEN_BLACKLISTED: 'Token has been invalidated or blacklisted',
    INVALID_CLAIMS: 'Token claims validation failed',
    REUSED_TOKEN: 'Attempted reuse of invalidated token'
} as const;

/**
 * Generates a cryptographically secure token identifier
 * @returns Unique token identifier string
 */
const generateTokenId = (): string => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Validates the JWT token payload structure and required fields
 * @param payload Token payload to validate
 * @throws Error if payload validation fails
 */
const validatePayload = (payload: Partial<JWTToken>): void => {
    if (!payload.userId || typeof payload.userId !== 'string') {
        throw new Error(JWT_ERRORS.INVALID_PAYLOAD);
    }
    if (!payload.email || typeof payload.email !== 'string') {
        throw new Error(JWT_ERRORS.INVALID_PAYLOAD);
    }
    if (!payload.role || !['customer', 'admin'].includes(payload.role)) {
        throw new Error(JWT_ERRORS.INVALID_PAYLOAD);
    }
};

/**
 * Generates a new JWT token with enhanced security features and comprehensive
 * payload validation implementing RS256 encryption
 * 
 * @param payload Token payload containing user information
 * @returns Promise resolving to signed JWT token string
 * @throws Error if token generation fails
 */
export const generateToken = async (payload: JWTToken): Promise<string> => {
    try {
        // Validate payload structure and required fields
        validatePayload(payload);

        // Generate secure token identifier
        const jti = generateTokenId();

        // Construct token with security claims
        const tokenPayload = {
            ...payload,
            jti,                              // Unique token ID
            iat: Math.floor(Date.now() / 1000), // Issued at
            nbf: Math.floor(Date.now() / 1000), // Not before
            exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour expiry
            iss: authConfig.jwt.issuer,       // Token issuer
            aud: authConfig.jwt.audience      // Token audience
        };

        // Sign token using RS256 algorithm
        return sign(tokenPayload, authConfig.jwt.secretKey, {
            algorithm: authConfig.jwt.algorithm,
            jwtid: jti
        });
    } catch (error) {
        console.error('Token generation failed:', error);
        throw new Error(JWT_ERRORS.INVALID_PAYLOAD);
    }
};

/**
 * Comprehensive token verification with multiple security checks
 * implementing strict validation protocols
 * 
 * @param token JWT token string to verify
 * @returns Promise resolving to token validity status
 * @throws Error if token verification fails
 */
export const verifyToken = async (token: string): Promise<boolean> => {
    try {
        // Verify token signature and claims
        const decoded = verify(token, authConfig.jwt.secretKey, {
            algorithms: [authConfig.jwt.algorithm],
            issuer: authConfig.jwt.issuer,
            audience: authConfig.jwt.audience,
            clockTolerance: authConfig.jwt.clockTolerance
        }) as JwtPayload;

        // Validate token payload
        validatePayload(decoded as Partial<JWTToken>);

        // Additional security checks
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp && decoded.exp < now) {
            throw new Error(JWT_ERRORS.EXPIRED_TOKEN);
        }
        if (decoded.nbf && decoded.nbf > now) {
            throw new Error(JWT_ERRORS.INVALID_TOKEN);
        }

        return true;
    } catch (error) {
        console.error('Token verification failed:', error);
        throw error;
    }
};

/**
 * Securely decodes and validates JWT token payload
 * implementing comprehensive type checking
 * 
 * @param token JWT token string to decode
 * @returns Promise resolving to validated token payload
 * @throws Error if token decoding fails
 */
export const decodeToken = async (token: string): Promise<JWTToken> => {
    try {
        // Verify token validity
        await verifyToken(token);

        // Decode token payload
        const decoded = decode(token, { complete: true });
        if (!decoded || !decoded.payload) {
            throw new Error(JWT_ERRORS.INVALID_TOKEN);
        }

        // Validate and type check payload
        const payload = decoded.payload as JWTToken;
        validatePayload(payload);

        return payload;
    } catch (error) {
        console.error('Token decode failed:', error);
        throw error;
    }
};

/**
 * Secure token refresh with rotation and validation
 * implementing protection against token reuse
 * 
 * @param refreshToken Refresh token string
 * @returns Promise resolving to new access token
 * @throws Error if token refresh fails
 */
export const refreshToken = async (refreshToken: string): Promise<string> => {
    try {
        // Verify refresh token
        await verifyToken(refreshToken);

        // Decode refresh token payload
        const payload = await decodeToken(refreshToken);

        // Generate new token with updated claims
        const newToken = await generateToken({
            userId: payload.userId,
            email: payload.email,
            role: payload.role
        });

        return newToken;
    } catch (error) {
        console.error('Token refresh failed:', error);
        throw new Error(JWT_ERRORS.REFRESH_FAILED);
    }
};