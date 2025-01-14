/**
 * @fileoverview Express router configuration for the visualization service endpoints.
 * Implements secure, authenticated routes for timeline, capability matrix, and collection
 * window visualizations with comprehensive error handling and request validation.
 * @version 1.0.0
 */

import { Router } from 'express'; // v4.18.2
import { authenticate } from 'express-jwt'; // v8.4.1
import { rateLimit } from 'express-rate-limit'; // v6.7.0
import { cache } from 'express-cache-middleware'; // v1.0.0
import { body, param, validationResult } from 'express-validator'; // v7.0.1
import { errorHandler } from 'express-error-handler'; // v1.1.0
import { VisualizationController } from '../controllers/visualization.controller';

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // requests per window

// Cache configuration
const CACHE_DURATION = 3600; // 1 hour in seconds

/**
 * Configures and returns Express router with authenticated visualization endpoints
 * @param controller Visualization controller instance
 * @returns Configured Express router
 */
export function configureRoutes(controller: VisualizationController): Router {
    const router = Router();

    // Configure rate limiting
    const limiter = rateLimit({
        windowMs: RATE_LIMIT_WINDOW,
        max: RATE_LIMIT_MAX,
        message: 'Too many requests, please try again later'
    });

    // Configure JWT authentication
    const auth = authenticate({
        secret: process.env.JWT_SECRET || 'development-secret',
        algorithms: ['RS256']
    });

    // Configure request validation middleware
    const validateRequest = (req: any, res: any, next: any) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    };

    // Timeline visualization endpoint
    router.post('/timeline',
        auth,
        limiter,
        [
            body('searchId').isUUID().withMessage('Valid search ID is required'),
            body('config').optional().isObject().withMessage('Invalid configuration')
        ],
        validateRequest,
        cache({ duration: CACHE_DURATION }),
        controller.generateTimeline
    );

    // Capability matrix visualization endpoint
    router.post('/capability-matrix',
        auth,
        limiter,
        [
            body('searchId').isUUID().withMessage('Valid search ID is required'),
            body('config').optional().isObject().withMessage('Invalid configuration')
        ],
        validateRequest,
        cache({ duration: CACHE_DURATION }),
        controller.generateCapabilityMatrix
    );

    // Collection windows visualization endpoint
    router.post('/collection-windows',
        auth,
        limiter,
        [
            body('searchId').isUUID().withMessage('Valid search ID is required'),
            body('config').optional().isObject().withMessage('Invalid configuration')
        ],
        validateRequest,
        cache({ duration: CACHE_DURATION }),
        controller.generateCollectionWindows
    );

    // Visualization export endpoint
    router.post('/export',
        auth,
        limiter,
        [
            body('searchId').isUUID().withMessage('Valid search ID is required'),
            body('type').isIn(['timeline', 'matrix', 'windows']).withMessage('Invalid visualization type'),
            body('format').isIn(['svg', 'png', 'pdf']).withMessage('Invalid export format')
        ],
        validateRequest,
        controller.exportVisualization
    );

    // Retrieve saved visualization endpoint
    router.get('/:id',
        auth,
        limiter,
        [
            param('id').isUUID().withMessage('Valid visualization ID is required')
        ],
        validateRequest,
        cache({ duration: CACHE_DURATION }),
        controller.getVisualizationById
    );

    // Health check endpoint
    router.get('/health', (req, res) => {
        res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Error handling middleware
    router.use(errorHandler({
        handlers: {
            '404': (err: any, req: any, res: any) => {
                res.status(404).json({ error: 'Resource not found' });
            },
            '5xx': (err: any, req: any, res: any) => {
                res.status(500).json({ error: 'Internal server error', trace: err.id });
            }
        }
    }));

    return router;
}

export default configureRoutes;