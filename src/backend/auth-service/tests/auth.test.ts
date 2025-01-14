// @package jest ^29.0.0
// @package ioredis-mock ^8.0.0
// @package crypto ^latest

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Redis from 'ioredis-mock';
import * as crypto from 'crypto';
import { AuthService } from '../src/services/auth.service';
import { User, UserRole, TokenPayload, SecurityContext } from '../src/interfaces/auth.interface';

describe('AuthService Security Tests', () => {
    let authService: AuthService;
    let redisClient: Redis;
    let mockUserModel: any;
    let mockSessionManager: any;
    let mockRateLimiter: any;
    let mockLogger: any;

    // Test data with enhanced security context
    const testUser: User = {
        id: 'test-user-id',
        email: 'test@matter.com',
        passwordHash: 'hashed_password',
        role: UserRole.CUSTOMER,
        status: 'active',
        lastLogin: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        preferences: {
            mfaEnabled: true,
            securityLevel: 'high'
        }
    };

    const testAdminUser: User = {
        ...testUser,
        id: 'test-admin-id',
        role: UserRole.ADMIN,
        email: 'admin@matter.com'
    };

    beforeAll(async () => {
        // Initialize secure Redis mock
        redisClient = new Redis({
            data: {
                // Pre-populate with test data
                'session:test-token': JSON.stringify({
                    userId: testUser.id,
                    expiresAt: Date.now() + 3600000
                })
            }
        });

        // Mock user model with security features
        mockUserModel = {
            findByEmail: jest.fn().mockResolvedValue(testUser),
            findById: jest.fn().mockResolvedValue(testUser),
            verifyPassword: jest.fn().mockResolvedValue(true),
            updateLastLogin: jest.fn().mockResolvedValue(true)
        };

        // Mock session manager with security validations
        mockSessionManager = {
            createSession: jest.fn().mockResolvedValue(true),
            getSession: jest.fn().mockResolvedValue({
                userId: testUser.id,
                expiresAt: Date.now() + 3600000
            }),
            invalidateUserSessions: jest.fn().mockResolvedValue(true),
            validateRefreshToken: jest.fn().mockResolvedValue(true),
            updateSession: jest.fn().mockResolvedValue(true)
        };

        // Mock rate limiter for security controls
        mockRateLimiter = {
            consume: jest.fn().mockResolvedValue(true)
        };

        // Mock logger for security audit
        mockLogger = {
            info: jest.fn().mockResolvedValue(true),
            warn: jest.fn().mockResolvedValue(true),
            error: jest.fn().mockResolvedValue(true)
        };

        // Initialize auth service with mocks
        authService = new AuthService(
            mockUserModel,
            mockSessionManager,
            mockRateLimiter,
            mockLogger
        );
    });

    afterAll(async () => {
        await redisClient.quit();
    });

    describe('Login Security Tests', () => {
        test('should enforce rate limiting on login attempts', async () => {
            mockRateLimiter.consume.mockRejectedValueOnce(new Error('RateLimiterError'));

            await expect(authService.login('test@matter.com', 'password'))
                .rejects
                .toThrow('Too many login attempts');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Rate limit exceeded',
                expect.any(Object)
            );
        });

        test('should require MFA when enabled', async () => {
            await expect(authService.login('test@matter.com', 'password'))
                .rejects
                .toThrow('MFA token required');

            expect(mockLogger.info).toHaveBeenCalledWith(
                'MFA required',
                expect.objectContaining({
                    userId: testUser.id
                })
            );
        });

        test('should validate MFA token correctly', async () => {
            const mfaToken = '123456';
            const result = await authService.login('test@matter.com', 'password', mfaToken);

            expect(result).toHaveProperty('token');
            expect(result).toHaveProperty('refreshToken');
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Successful login',
                expect.any(Object)
            );
        });

        test('should block inactive accounts', async () => {
            mockUserModel.findByEmail.mockResolvedValueOnce({
                ...testUser,
                status: 'inactive'
            });

            await expect(authService.login('test@matter.com', 'password'))
                .rejects
                .toThrow('Account is not active');
        });
    });

    describe('Session Security Tests', () => {
        test('should validate session integrity', async () => {
            const token = 'valid-token';
            const user = await authService.verifySession(token);

            expect(user).toBeDefined();
            expect(mockSessionManager.getSession).toHaveBeenCalledWith(token);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Session verified',
                expect.any(Object)
            );
        });

        test('should detect tampered sessions', async () => {
            mockSessionManager.getSession.mockResolvedValueOnce(null);

            await expect(authService.verifySession('invalid-token'))
                .rejects
                .toThrow('Invalid session');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Session verification error',
                expect.any(Object)
            );
        });

        test('should enforce session timeout', async () => {
            mockSessionManager.getSession.mockResolvedValueOnce({
                userId: testUser.id,
                expiresAt: Date.now() - 1000
            });

            await expect(authService.verifySession('expired-token'))
                .rejects
                .toThrow('Invalid session');
        });
    });

    describe('Token Security Tests', () => {
        test('should securely refresh tokens', async () => {
            const refreshToken = 'valid-refresh-token';
            const result = await authService.refreshAccessToken(refreshToken);

            expect(result).toHaveProperty('token');
            expect(result).toHaveProperty('refreshToken');
            expect(mockSessionManager.updateSession).toHaveBeenCalled();
        });

        test('should detect invalid refresh tokens', async () => {
            mockSessionManager.validateRefreshToken.mockResolvedValueOnce(false);

            await expect(authService.refreshAccessToken('invalid-token'))
                .rejects
                .toThrow('Invalid refresh token');
        });
    });

    describe('Logout Security Tests', () => {
        test('should invalidate all user sessions on logout', async () => {
            await authService.logout(testUser.id, 'valid-token');

            expect(mockSessionManager.invalidateUserSessions)
                .toHaveBeenCalledWith(testUser.id);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'User logged out',
                expect.any(Object)
            );
        });

        test('should handle invalid logout attempts', async () => {
            mockSessionManager.getSession.mockResolvedValueOnce(null);

            await expect(authService.logout(testUser.id, 'invalid-token'))
                .rejects
                .toThrow('Invalid session');
        });
    });

    describe('Role-Based Access Control Tests', () => {
        test('should enforce admin privileges', async () => {
            mockUserModel.findByEmail.mockResolvedValueOnce(testAdminUser);

            const result = await authService.login('admin@matter.com', 'password', '123456');
            expect(result.token).toBeDefined();
            
            // Verify admin role in token
            const decodedToken = JSON.parse(Buffer.from(
                result.token.split('.')[1], 'base64'
            ).toString());
            expect(decodedToken.role).toBe(UserRole.ADMIN);
        });

        test('should restrict customer access', async () => {
            const result = await authService.login('test@matter.com', 'password', '123456');
            
            const decodedToken = JSON.parse(Buffer.from(
                result.token.split('.')[1], 'base64'
            ).toString());
            expect(decodedToken.role).toBe(UserRole.CUSTOMER);
        });
    });

    describe('Security Audit Tests', () => {
        test('should log security events', async () => {
            await authService.login('test@matter.com', 'password', '123456');

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Successful login',
                expect.objectContaining({
                    userId: testUser.id,
                    timestamp: expect.any(Date)
                })
            );
        });

        test('should log failed attempts', async () => {
            mockUserModel.verifyPassword.mockResolvedValueOnce(false);

            await expect(authService.login('test@matter.com', 'wrong-password'))
                .rejects
                .toThrow('Invalid credentials');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Failed login attempt',
                expect.any(Object)
            );
        });
    });
});