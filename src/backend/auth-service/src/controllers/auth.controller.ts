// @package express ^4.18.2
// @package http-status-codes ^2.2.0
// @package express-rate-limit ^6.7.0
// @package @nestjs/common ^9.0.0

import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { RateLimit } from 'express-rate-limit';
import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { AuthError, ValidationError } from '@nestjs/common';

import { AuthService } from '../services/auth.service';
import { User, TokenPayload, AuthRequest, SecurityHeaders } from '../interfaces/auth.interface';

/**
 * Enhanced authentication controller implementing secure endpoints
 * Compliant with OAuth 2.0, JWT, and MFA security requirements
 */
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
    private readonly RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
    private readonly MAX_LOGIN_ATTEMPTS = 5;
    private readonly SECURITY_HEADERS: SecurityHeaders = {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Content-Security-Policy': "default-src 'self'",
        'Cache-Control': 'no-store, max-age=0'
    };

    constructor(
        private readonly authService: AuthService,
        private readonly logger: any,
        private readonly rateLimiter: RateLimit
    ) {
        // Initialize rate limiter
        this.rateLimiter = new RateLimit({
            windowMs: this.RATE_LIMIT_WINDOW,
            max: this.MAX_LOGIN_ATTEMPTS,
            message: 'Too many login attempts, please try again later'
        });
    }

    /**
     * Handles user login with enhanced security measures
     * @param req Express request
     * @param res Express response
     */
    @Post('login')
    @UseGuards(ValidationGuard)
    async login(req: Request, res: Response): Promise<Response> {
        try {
            const { email, password, mfaToken } = req.body;

            // Input validation
            if (!email || !password) {
                throw new ValidationError('Email and password are required');
            }

            // Sanitize input
            const sanitizedEmail = email.toLowerCase().trim();

            // Attempt login with MFA if provided
            const tokenPayload: TokenPayload = await this.authService.login(
                sanitizedEmail,
                password,
                mfaToken
            );

            // Set secure headers
            Object.entries(this.SECURITY_HEADERS).forEach(([key, value]) => {
                res.setHeader(key, value);
            });

            // Set secure cookie with token
            res.cookie('refreshToken', tokenPayload.refreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            // Log successful login
            await this.logger.info('Login successful', {
                email: sanitizedEmail,
                timestamp: new Date()
            });

            return res.status(StatusCodes.OK).json({
                token: tokenPayload.token,
                expiresIn: tokenPayload.expiresIn
            });

        } catch (error) {
            await this.logger.error('Login failed', {
                error: error.message,
                timestamp: new Date()
            });

            if (error instanceof ValidationError) {
                return res.status(StatusCodes.BAD_REQUEST).json({
                    error: error.message
                });
            }

            return res.status(StatusCodes.UNAUTHORIZED).json({
                error: 'Invalid credentials'
            });
        }
    }

    /**
     * Handles user logout with session cleanup
     * @param req Authenticated request
     * @param res Express response
     */
    @Post('logout')
    @UseGuards(AuthGuard)
    async logout(req: AuthRequest, res: Response): Promise<Response> {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                throw new AuthError('No token provided');
            }

            await this.authService.logout(req.user.id, token);

            // Clear secure cookies
            res.clearCookie('refreshToken', {
                httpOnly: true,
                secure: true,
                sameSite: 'strict'
            });

            // Set security headers
            Object.entries(this.SECURITY_HEADERS).forEach(([key, value]) => {
                res.setHeader(key, value);
            });

            // Log logout
            await this.logger.info('Logout successful', {
                userId: req.user.id,
                timestamp: new Date()
            });

            return res.status(StatusCodes.OK).json({
                message: 'Logged out successfully'
            });

        } catch (error) {
            await this.logger.error('Logout failed', {
                error: error.message,
                userId: req.user?.id,
                timestamp: new Date()
            });

            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                error: 'Logout failed'
            });
        }
    }

    /**
     * Handles token refresh with enhanced validation
     * @param req Express request
     * @param res Express response
     */
    @Post('refresh')
    @UseGuards(RefreshGuard)
    async refreshToken(req: Request, res: Response): Promise<Response> {
        try {
            const refreshToken = req.cookies.refreshToken;
            if (!refreshToken) {
                throw new AuthError('No refresh token provided');
            }

            const tokenPayload = await this.authService.refreshAccessToken(refreshToken);

            // Set security headers
            Object.entries(this.SECURITY_HEADERS).forEach(([key, value]) => {
                res.setHeader(key, value);
            });

            // Update refresh token cookie
            res.cookie('refreshToken', tokenPayload.refreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            // Log token refresh
            await this.logger.info('Token refreshed', {
                timestamp: new Date()
            });

            return res.status(StatusCodes.OK).json({
                token: tokenPayload.token,
                expiresIn: tokenPayload.expiresIn
            });

        } catch (error) {
            await this.logger.error('Token refresh failed', {
                error: error.message,
                timestamp: new Date()
            });

            return res.status(StatusCodes.UNAUTHORIZED).json({
                error: 'Invalid refresh token'
            });
        }
    }

    /**
     * Retrieves user profile with role verification
     * @param req Authenticated request
     * @param res Express response
     */
    @Get('profile')
    @UseGuards(AuthGuard, RoleGuard)
    async getProfile(req: AuthRequest, res: Response): Promise<Response> {
        try {
            const user = await this.authService.verifySession(
                req.headers.authorization?.split(' ')[1] || ''
            );

            // Set security headers
            Object.entries(this.SECURITY_HEADERS).forEach(([key, value]) => {
                res.setHeader(key, value);
            });

            // Sanitize user data
            const sanitizedUser: Partial<User> = {
                id: user.id,
                email: user.email,
                role: user.role,
                lastLogin: user.lastLogin,
                preferences: user.preferences
            };

            // Log profile access
            await this.logger.info('Profile accessed', {
                userId: user.id,
                timestamp: new Date()
            });

            return res.status(StatusCodes.OK).json(sanitizedUser);

        } catch (error) {
            await this.logger.error('Profile access failed', {
                error: error.message,
                timestamp: new Date()
            });

            return res.status(StatusCodes.UNAUTHORIZED).json({
                error: 'Invalid session'
            });
        }
    }
}

export { AuthController };