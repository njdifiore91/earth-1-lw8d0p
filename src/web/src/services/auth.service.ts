/**
 * Authentication Service for Matter Satellite Data Product Matching Platform
 * @version 1.0.0
 * Implements enterprise-grade authentication with OAuth 2.0, Auth0 integration,
 * JWT token management, and enhanced security features
 */

// External imports
import { Auth0Client } from '@auth0/auth0-spa-js'; // ^2.1.0
import jwtDecode from 'jwt-decode'; // ^3.1.2

// Internal imports
import { User, UserRole, LoginCredentials, AuthState } from '../types/user.types';
import { authConfig } from '../config/auth.config';
import { ApiService } from './api.service';
import { API_ERROR_CODES } from '../constants/api.constants';

/**
 * Security event interface for monitoring and logging
 */
interface SecurityEvent {
  type: 'login' | 'logout' | 'token_refresh' | 'session_validation' | 'security_violation';
  userId?: string;
  details: Record<string, unknown>;
  timestamp: string;
}

/**
 * Rate limiter configuration for security
 */
interface RateLimiterConfig {
  maxAttempts: number;
  windowMs: number;
  blockDuration: number;
}

/**
 * Enhanced authentication service with advanced security features
 */
export class AuthService {
  private auth0Client: Auth0Client;
  private readonly apiService: ApiService;
  private authState: AuthState;
  private readonly rateLimiter: Map<string, { attempts: number; timestamp: number }>;
  private readonly securityMonitor: Map<string, SecurityEvent[]>;
  private readonly tokenRotator: Map<string, { token: string; rotationTime: number }>;
  private readonly sessionManager: Map<string, { lastActivity: number; deviceId: string }>;

  constructor(apiService: ApiService) {
    this.apiService = apiService;
    this.auth0Client = new Auth0Client(authConfig.auth0);
    this.rateLimiter = new Map();
    this.securityMonitor = new Map();
    this.tokenRotator = new Map();
    this.sessionManager = new Map();
    
    this.authState = {
      user: null,
      isAuthenticated: false,
      loading: false,
      error: null,
      refreshToken: null,
      sessionExpiry: null,
      mfaRequired: false
    };

    // Initialize security monitoring
    this.initializeSecurityMonitoring();
  }

  /**
   * Enhanced login with MFA support and security checks
   */
  public async login(credentials: LoginCredentials): Promise<AuthState> {
    try {
      this.authState.loading = true;
      
      // Check rate limiting
      if (this.isRateLimited(credentials.email)) {
        throw new Error(API_ERROR_CODES.AUTHENTICATION_ERROR.message);
      }

      // Authenticate with Auth0
      const auth0Response = await this.auth0Client.loginWithCredentials({
        ...credentials,
        audience: authConfig.auth0.audience,
        scope: authConfig.auth0.advancedOptions.defaultScope
      });

      // Verify MFA if required
      if (auth0Response.mfa_required) {
        this.authState.mfaRequired = true;
        return this.authState;
      }

      // Process authentication response
      const { access_token, refresh_token, id_token } = auth0Response;
      const decodedToken = jwtDecode<{ sub: string; email: string; role: UserRole }>(id_token);

      // Validate token and role
      this.validateToken(access_token);
      
      // Check if MFA is required for role
      if (authConfig.roles.mfaRequired.includes(decodedToken.role) && !auth0Response.mfa_completed) {
        throw new Error('MFA required for this role');
      }

      // Get user profile
      const user = await this.getUserProfile(decodedToken.sub);

      // Setup token rotation
      this.setupTokenRotation(access_token, refresh_token);

      // Initialize session
      this.initializeSession(user.id);

      // Update auth state
      this.authState = {
        user,
        isAuthenticated: true,
        loading: false,
        error: null,
        refreshToken: refresh_token,
        sessionExpiry: this.calculateSessionExpiry(),
        mfaRequired: false
      };

      // Log security event
      this.logSecurityEvent({
        type: 'login',
        userId: user.id,
        details: { success: true, timestamp: new Date().toISOString() }
      });

      return this.authState;

    } catch (error) {
      this.handleLoginFailure(credentials.email, error);
      throw error;
    } finally {
      this.authState.loading = false;
    }
  }

  /**
   * Comprehensive session validation
   */
  public async validateSession(): Promise<boolean> {
    try {
      if (!this.authState.user) return false;

      const sessionInfo = this.sessionManager.get(this.authState.user.id);
      if (!sessionInfo) return false;

      // Check session expiry
      if (this.isSessionExpired()) {
        await this.logout();
        return false;
      }

      // Verify device fingerprint
      if (!this.verifyDeviceFingerprint(sessionInfo.deviceId)) {
        this.handleSecurityViolation('Invalid device fingerprint');
        return false;
      }

      // Check IP restrictions
      if (!this.checkIpRestrictions()) {
        this.handleSecurityViolation('IP restriction violation');
        return false;
      }

      // Update session activity
      this.updateSessionActivity(this.authState.user.id);

      return true;
    } catch (error) {
      this.logSecurityEvent({
        type: 'session_validation',
        userId: this.authState.user?.id,
        details: { error: error.message }
      });
      return false;
    }
  }

  /**
   * Enhanced token refresh with rotation policy
   */
  public async refreshTokenWithRotation(): Promise<string> {
    try {
      if (!this.authState.refreshToken) {
        throw new Error('No refresh token available');
      }

      // Check token blacklist
      if (this.isTokenBlacklisted(this.authState.refreshToken)) {
        throw new Error('Token has been revoked');
      }

      // Get new tokens
      const auth0Response = await this.auth0Client.refreshToken({
        refreshToken: this.authState.refreshToken
      });

      const { access_token, refresh_token } = auth0Response;

      // Validate new tokens
      this.validateToken(access_token);

      // Update token rotation
      this.setupTokenRotation(access_token, refresh_token);

      // Update auth state
      this.authState.refreshToken = refresh_token;
      this.authState.sessionExpiry = this.calculateSessionExpiry();

      // Log token refresh
      this.logSecurityEvent({
        type: 'token_refresh',
        userId: this.authState.user?.id,
        details: { success: true }
      });

      return access_token;
    } catch (error) {
      this.handleSecurityViolation('Token refresh failed');
      throw error;
    }
  }

  /**
   * Security event handling and monitoring
   */
  public async handleSecurityEvent(event: SecurityEvent): Promise<void> {
    this.logSecurityEvent(event);

    // Check security thresholds
    if (this.isSecurityThresholdExceeded(event.userId)) {
      await this.enforceSecurityMeasures(event.userId);
    }

    // Update security metrics
    this.updateSecurityMetrics(event);

    // Notify if necessary
    if (this.shouldNotifySecurityEvent(event)) {
      await this.notifySecurityTeam(event);
    }
  }

  /**
   * Private helper methods
   */
  private initializeSecurityMonitoring(): void {
    setInterval(() => this.cleanupExpiredSessions(), authConfig.security.sessionTimeout * 1000);
    setInterval(() => this.rotateExpiredTokens(), authConfig.jwt.accessTokenExpiry * 1000);
  }

  private isRateLimited(identifier: string): boolean {
    const now = Date.now();
    const attempt = this.rateLimiter.get(identifier);

    if (!attempt) {
      this.rateLimiter.set(identifier, { attempts: 1, timestamp: now });
      return false;
    }

    if (now - attempt.timestamp > authConfig.security.rateLimiting.windowMs) {
      this.rateLimiter.set(identifier, { attempts: 1, timestamp: now });
      return false;
    }

    if (attempt.attempts >= authConfig.security.rateLimiting.maxAttempts) {
      return true;
    }

    attempt.attempts++;
    return false;
  }

  private async getUserProfile(userId: string): Promise<User> {
    const response = await this.apiService.get<User>(`${authConfig.auth0.audience}/users/${userId}`);
    return response.data;
  }

  private validateToken(token: string): void {
    const decoded = jwtDecode(token);
    if (!decoded || !this.isTokenValid(decoded)) {
      throw new Error('Invalid token');
    }
  }

  private isTokenValid(decoded: any): boolean {
    return (
      decoded.exp * 1000 > Date.now() &&
      decoded.iss === authConfig.jwt.issuer &&
      decoded.aud === authConfig.jwt.audience
    );
  }

  private setupTokenRotation(accessToken: string, refreshToken: string): void {
    const rotationTime = Date.now() + (authConfig.jwt.accessTokenExpiry * 1000);
    this.tokenRotator.set(this.authState.user?.id || '', {
      token: accessToken,
      rotationTime
    });
  }

  private calculateSessionExpiry(): Date {
    return new Date(Date.now() + (authConfig.security.sessionTimeout * 1000));
  }

  private isSessionExpired(): boolean {
    return this.authState.sessionExpiry ? 
      Date.now() > this.authState.sessionExpiry.getTime() : true;
  }

  private handleLoginFailure(email: string, error: Error): void {
    this.authState = {
      ...this.authState,
      error: error.message,
      loading: false,
      isAuthenticated: false
    };

    this.logSecurityEvent({
      type: 'login',
      details: { email, error: error.message, success: false }
    });
  }

  private logSecurityEvent(event: SecurityEvent): void {
    const userId = event.userId || 'anonymous';
    const events = this.securityMonitor.get(userId) || [];
    events.push({ ...event, timestamp: new Date().toISOString() });
    this.securityMonitor.set(userId, events);
  }

  private isSecurityThresholdExceeded(userId?: string): boolean {
    if (!userId) return false;
    const events = this.securityMonitor.get(userId) || [];
    const recentEvents = events.filter(e => 
      new Date(e.timestamp).getTime() > Date.now() - 3600000
    );
    return recentEvents.length >= authConfig.security.maxLoginAttempts;
  }

  private async enforceSecurityMeasures(userId: string): Promise<void> {
    await this.logout();
    this.sessionManager.delete(userId);
    this.tokenRotator.delete(userId);
  }

  private updateSecurityMetrics(event: SecurityEvent): void {
    // Implementation for security metrics update
  }

  private shouldNotifySecurityEvent(event: SecurityEvent): boolean {
    return event.type === 'security_violation' || 
           (event.type === 'login' && event.details.success === false);
  }

  private async notifySecurityTeam(event: SecurityEvent): Promise<void> {
    // Implementation for security team notification
  }
}

export default AuthService;