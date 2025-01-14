// @package express ^4.18.2
// @package helmet ^6.0.1
// @package cors ^2.8.5
// @package compression ^1.7.4
// @package morgan ^1.10.0
// @package express-rate-limit ^6.7.0
// @package @auth0/auth0-spa-js ^2.0.0
// @package http-errors ^2.0.0

import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import createHttpError from 'http-errors';
import { authConfig } from './config/auth.config';
import authRouter from './routes/auth.routes';

/**
 * Main application class implementing secure Express server with comprehensive
 * middleware chain and enhanced security protocols
 */
class App {
    private readonly app: Express;
    private readonly port: number;

    constructor() {
        this.app = express();
        this.port = parseInt(process.env.PORT || '3000', 10);

        this.initializeMiddleware();
        this.initializeRoutes();
        this.initializeErrorHandling();
    }

    /**
     * Initializes comprehensive middleware chain with security features
     */
    private initializeMiddleware(): void {
        // Security headers
        this.app.use(helmet({
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
        }));

        // CORS configuration
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
            methods: ['GET', 'POST'],
            credentials: true,
            maxAge: 86400,
            allowedHeaders: ['Content-Type', 'Authorization'],
            exposedHeaders: ['X-RateLimit-Reset']
        }));

        // Rate limiting
        this.app.use(rateLimit({
            windowMs: authConfig.security.rateLimiting.windowMs,
            max: authConfig.security.rateLimiting.maxAttempts,
            standardHeaders: true,
            legacyHeaders: false
        }));

        // Request parsing
        this.app.use(express.json({ limit: '10kb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10kb' }));

        // Response compression
        this.app.use(compression());

        // Request logging
        this.app.use(morgan('[:date[iso]] :method :url :status :response-time ms - :res[content-length]', {
            skip: (req: Request) => process.env.NODE_ENV === 'test'
        }));

        // Security headers check
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            next();
        });
    }

    /**
     * Initializes authentication routes with security middleware
     */
    private initializeRoutes(): void {
        this.app.use('/api/v1/auth', authRouter);

        // Health check endpoint
        this.app.get('/health', (req: Request, res: Response) => {
            res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
        });

        // 404 handler
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            next(createHttpError(404, 'Resource not found'));
        });
    }

    /**
     * Initializes comprehensive error handling with security considerations
     */
    private initializeErrorHandling(): void {
        this.app.use((error: any, req: Request, res: Response, next: NextFunction) => {
            console.error('Error:', {
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
                timestamp: new Date().toISOString()
            });

            const statusCode = error.status || 500;
            const message = statusCode === 500 ? 'Internal server error' : error.message;

            res.status(statusCode).json({
                status: 'error',
                statusCode,
                message,
                ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
            });
        });
    }

    /**
     * Starts the secure Express server
     */
    public async listen(): Promise<void> {
        try {
            this.app.listen(this.port, () => {
                console.info(`Authentication service listening on port ${this.port}`);
                console.info(`Environment: ${process.env.NODE_ENV}`);
                console.info(`Time: ${new Date().toISOString()}`);
            });
        } catch (error) {
            console.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    /**
     * Returns Express application instance
     */
    public getApp(): Express {
        return this.app;
    }
}

// Create and export application instance
const app = new App();
export default app;