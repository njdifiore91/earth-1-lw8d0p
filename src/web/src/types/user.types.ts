// External imports
import { Theme } from '@mui/material'; // ^5.0.0

// Internal imports
import { ApiResponse } from './api.types';

/**
 * Enumeration of available user roles with strict access control
 */
export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
  SERVICE = 'SERVICE'
}

/**
 * Strongly typed user permissions with support for custom permissions
 */
export type UserPermission = 
  | 'read'
  | 'write'
  | 'admin'
  | 'manage_users'
  | 'view_analytics'
  | 'export_data'
  | `custom_${string}`;

/**
 * Session status types for enhanced security tracking
 */
export type SessionStatus = 'active' | 'expired' | 'locked' | 'requires_mfa';

/**
 * Authentication token structure with expiration tracking
 */
export type AuthToken = {
  readonly token: string;
  readonly expiresAt: Date;
};

/**
 * Comprehensive interface for user accessibility preferences
 */
export interface AccessibilityOptions {
  readonly highContrast: boolean;
  readonly fontSize: number;
  readonly reduceMotion: boolean;
  readonly screenReaderOptimized: boolean;
}

/**
 * Detailed notification preferences configuration
 */
export interface NotificationSettings {
  readonly email: boolean;
  readonly searchComplete: boolean;
  readonly systemUpdates: boolean;
  readonly searchOptimizations: boolean;
  readonly securityAlerts: boolean;
}

/**
 * Extended user preferences including theme, location, and accessibility
 */
export interface UserPreferences {
  readonly theme: Theme;
  readonly defaultSearchLocation: {
    readonly lat: number;
    readonly lng: number;
  };
  readonly notifications: NotificationSettings;
  readonly language: string;
  readonly timezone: string;
  readonly accessibility: AccessibilityOptions;
}

/**
 * Core user interface with comprehensive type safety
 */
export interface User {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
  readonly preferences: UserPreferences;
  readonly lastLogin: Date;
  readonly mfaEnabled: boolean;
}

/**
 * Enhanced authentication state management interface
 */
export interface AuthState {
  readonly user: User | null;
  readonly isAuthenticated: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refreshToken: string | null;
  readonly sessionExpiry: Date | null;
  readonly mfaRequired: boolean;
}

/**
 * Type guard to check if a user has specific permission
 */
export function hasPermission(user: User, permission: UserPermission): boolean {
  switch (user.role) {
    case UserRole.ADMIN:
      return true;
    case UserRole.CUSTOMER:
      return ['read', 'write', 'export_data'].includes(permission);
    case UserRole.SERVICE:
      return permission.startsWith('custom_') || permission === 'read';
    default:
      return false;
  }
}

/**
 * Type guard to check if a value is a valid User object
 */
export function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'email' in value &&
    'role' in value &&
    'preferences' in value &&
    'lastLogin' in value &&
    'mfaEnabled' in value
  );
}

/**
 * Type assertion for user API responses
 */
export function assertUserResponse(response: ApiResponse<unknown>): asserts response is ApiResponse<User> {
  if (!isUser(response.data)) {
    throw new Error('Invalid user data in API response');
  }
}