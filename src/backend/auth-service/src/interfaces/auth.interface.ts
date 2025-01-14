// @package express ^4.18.2
import { Request } from 'express';

/**
 * Strict enumeration of available user roles for Role-Based Access Control (RBAC)
 * Implements security requirements for user access levels and permissions
 */
export enum UserRole {
    CUSTOMER = 'customer',
    ADMIN = 'admin'
}

/**
 * Comprehensive interface defining user properties with security and audit fields
 * Implements data security requirements with encrypted password storage and audit trails
 */
export interface User {
    id: string;                         // UUID v4 for user identification
    email: string;                      // Unique email identifier
    passwordHash: string;               // Securely hashed password (bcrypt)
    role: UserRole;                     // RBAC role assignment
    status: string;                     // Account status (active/inactive/suspended)
    lastLogin: Date;                    // Last successful authentication timestamp
    createdAt: Date;                    // Account creation timestamp
    updatedAt: Date;                    // Last modification timestamp
    preferences: Record<string, any>;   // User-specific settings and preferences
}

/**
 * Enhanced interface for JWT token payload with comprehensive security fields
 * Implements OAuth 2.0 and JWT security requirements with standard claims
 */
export interface JWTToken {
    userId: string;     // User identifier
    email: string;      // User email
    role: UserRole;     // User role for authorization
    iat: number;        // Issued at timestamp
    exp: number;        // Expiration timestamp
    iss: string;        // Token issuer (Matter Platform)
    aud: string;        // Intended audience
}

/**
 * Interface for token response data with refresh token support
 * Implements secure token management with refresh capabilities
 */
export interface TokenPayload {
    token: string;          // JWT access token
    refreshToken: string;   // Refresh token for token renewal
    expiresIn: number;      // Token expiration time in seconds
}

/**
 * Extended Express Request interface with authenticated user data
 * Implements type safety for authenticated request handling
 */
export interface AuthRequest extends Request {
    user: User;            // Authenticated user data
}