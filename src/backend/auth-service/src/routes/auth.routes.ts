// @package express ^4.18.2
// @package celebrate ^15.0.1
// @package express-rate-limit ^6.7.0
// @package helmet ^7.0.0
// @package cors ^2.8.5

import { Router } from 'express';
import { celebrate, Joi, Segments } from 'celebrate';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { AuthController } from '../controllers/auth.controller';
import { authenticateToken, requireRole, validateSession } from '../middleware/auth.middleware';
import { UserRole } from '../interfaces/auth.interface';

// Initialize Express router
const router = Router();

/**
 * Rate limiting configuration for authentication endpoints
 * Implements brute force protection with standardized headers
 */
const rateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Max 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false
};

/**
 * CORS configuration implementing strict origin controls
 */
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
    maxAge: 86400, // 24 hours
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-RateLimit-Reset']
};

/**
 * Request validation schemas implementing strict input validation
 */
const loginValidation = {
    [Segments.BODY]: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(12).required(),
        mfaToken: Joi.string().length(6).optional()
    })
};

const refreshTokenValidation = {
    [Segments.BODY]: Joi.object({
        refreshToken: Joi.string().required()
    })
};

/**
 * Security headers configuration implementing HTTP security best practices
 */
const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
});

/**
 * Audit logging middleware implementing security event tracking
 */
const auditLog = (req: any, res: any, next: any) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        console.info('Auth Route Access', {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            timestamp: new Date()
        });
    });
    next();
};

// Public authentication routes
router.post('/login',
    rateLimit(rateLimitConfig),
    cors(corsOptions),
    securityHeaders,
    celebrate(loginValidation),
    auditLog,
    AuthController.login
);

router.post('/refresh-token',
    rateLimit(rateLimitConfig),
    cors(corsOptions),
    securityHeaders,
    celebrate(refreshTokenValidation),
    auditLog,
    AuthController.refreshToken
);

// Protected routes requiring authentication
router.post('/logout',
    rateLimit(rateLimitConfig),
    cors(corsOptions),
    securityHeaders,
    authenticateToken,
    validateSession,
    auditLog,
    AuthController.logout
);

router.get('/profile',
    rateLimit(rateLimitConfig),
    cors(corsOptions),
    securityHeaders,
    authenticateToken,
    validateSession,
    auditLog,
    AuthController.getProfile
);

// Admin-only routes
router.get('/users',
    rateLimit(rateLimitConfig),
    cors(corsOptions),
    securityHeaders,
    authenticateToken,
    validateSession,
    requireRole([UserRole.ADMIN]),
    auditLog,
    AuthController.getUsers
);

// Error handling for validation failures
router.use((err: any, req: any, res: any, next: any) => {
    if (err.isJoi) {
        return res.status(400).json({
            error: 'Validation error',
            details: err.details
        });
    }
    next(err);
});

export default router;