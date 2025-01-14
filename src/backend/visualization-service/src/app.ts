/**
 * @fileoverview Main application entry point for the Matter visualization service.
 * Implements a secure, performant Express server with comprehensive middleware,
 * monitoring, and visualization route configuration.
 * @version 1.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express'; // v4.18.2
import cors from 'cors'; // v2.8.5
import helmet from 'helmet'; // v7.0.0
import morgan from 'morgan'; // v1.10.0
import compression from 'compression'; // v1.7.4
import rateLimit from 'express-rate-limit'; // v6.7.0
import { Registry, collectDefaultMetrics } from 'prom-client'; // v14.2.0
import { createVisualizationDatabasePool } from './config/database.config';
import { configureRoutes } from './routes/visualization.routes';
import { VisualizationController } from './controllers/visualization.controller';

// Environment configuration
const PORT = process.env.PORT || 3003;
const NODE_ENV = process.env.NODE_ENV || 'development';
const RATE_LIMIT_WINDOW = process.env.RATE_LIMIT_WINDOW || 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || 100;

// Initialize Prometheus metrics
const register = new Registry();
collectDefaultMetrics({ register });

/**
 * Initializes and configures the Express application with comprehensive
 * middleware, security, and monitoring setup.
 */
function initializeApp(): Express {
    const app = express();

    // Security middleware configuration
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'blob:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
            },
        },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: { policy: "same-site" },
        dnsPrefetchControl: { allow: false },
        frameguard: { action: "deny" },
        hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
        ieNoOpen: true,
        noSniff: true,
        permittedCrossDomainPolicies: { permittedPolicies: "none" },
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        xssFilter: true,
    }));

    // CORS configuration
    app.use(cors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Content-Length', 'X-Request-Id'],
        credentials: true,
        maxAge: 600, // 10 minutes
    }));

    // Request logging
    app.use(morgan('combined', {
        skip: (req) => req.url === '/health' || req.url === '/metrics'
    }));

    // Response compression
    app.use(compression({
        threshold: 1024, // Only compress responses larger than 1KB
        filter: (req, res) => {
            if (req.headers['x-no-compression']) return false;
            return compression.filter(req, res);
        },
        level: 6 // Balanced compression level
    }));

    // Rate limiting
    app.use(rateLimit({
        windowMs: Number(RATE_LIMIT_WINDOW),
        max: Number(RATE_LIMIT_MAX),
        message: 'Too many requests from this IP, please try again later',
        standardHeaders: true,
        legacyHeaders: false,
    }));

    // Body parsing middleware
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Initialize database pool
    const dbPool = createVisualizationDatabasePool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'matter_viz',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true',
        enablePostgis: true
    });

    // Configure visualization routes
    const visualizationController = new VisualizationController();
    app.use('/api/v1/visualizations', configureRoutes(visualizationController));

    // Metrics endpoint
    app.get('/metrics', async (req: Request, res: Response) => {
        try {
            res.set('Content-Type', register.contentType);
            res.end(await register.metrics());
        } catch (error) {
            res.status(500).end(error);
        }
    });

    // Health check endpoint
    app.get('/health', (req: Request, res: Response) => {
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            environment: NODE_ENV
        });
    });

    // Error handling middleware
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        console.error('Unhandled error:', err);
        res.status(500).json({
            error: 'Internal server error',
            requestId: req.headers['x-request-id'],
            timestamp: new Date().toISOString()
        });
    });

    return app;
}

/**
 * Starts the Express server with proper error handling and shutdown procedures
 * @param app Express application instance
 */
function startServer(app: Express) {
    const server = app.listen(PORT, () => {
        console.log(`Visualization service listening on port ${PORT} in ${NODE_ENV} mode`);
    });

    // Graceful shutdown handler
    process.on('SIGTERM', () => handleGracefulShutdown(server));
    process.on('SIGINT', () => handleGracefulShutdown(server));

    return server;
}

/**
 * Handles graceful shutdown of server and resources
 * @param server HTTP server instance
 */
function handleGracefulShutdown(server: any) {
    console.log('Received shutdown signal, starting graceful shutdown...');

    server.close((err: Error) => {
        if (err) {
            console.error('Error during server shutdown:', err);
            process.exit(1);
        }

        console.log('Server shut down successfully');
        process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
        console.error('Forced shutdown due to timeout');
        process.exit(1);
    }, 30000);
}

// Initialize and start the application
const app = initializeApp();
if (process.env.NODE_ENV !== 'test') {
    startServer(app);
}

export default app;