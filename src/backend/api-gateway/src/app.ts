// express v4.18.2
import express, { Express, Request, Response, NextFunction } from 'express';
// helmet v6.0.1
import helmet from 'helmet';
// rate-limit-redis v3.0.0
import { RateLimiterRedis } from 'rate-limit-redis';
// @opentelemetry/api v1.4.0
import { trace, context, propagation } from '@opentelemetry/api';
// winston v3.8.2
import winston from 'winston';
// opossum v6.0.1
import CircuitBreaker from 'opossum';
// compression v1.7.4
import compression from 'compression';
// cors v2.8.5
import cors from 'cors';
// express-prometheus-middleware v1.2.0
import promMiddleware from 'express-prometheus-middleware';

import { gatewayConfig } from './config/gateway.config';
import { authenticate } from './middleware/auth.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

// Initialize tracer
const tracer = trace.getTracer('api-gateway');

// Initialize logger
const logger = winston.createLogger({
  level: gatewayConfig.server.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Initialize Express app
const app: Express = express();

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Security middleware
app.use(helmet(gatewayConfig.security.helmet));
app.use(cors(gatewayConfig.security.cors));

// Request correlation middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const ctx = context.active();
  const span = tracer.startSpan('http_request', undefined, ctx);
  
  span.setAttribute('http.request_id', requestId);
  span.setAttribute('http.method', req.method);
  span.setAttribute('http.url', req.url);

  res.setHeader('x-request-id', requestId);
  
  res.on('finish', () => {
    span.setAttribute('http.status_code', res.statusCode);
    span.end();
  });

  next();
});

// Rate limiting middleware
const rateLimiter = new RateLimiterRedis({
  storeClient: gatewayConfig.redis,
  points: gatewayConfig.security.rateLimit.standardMax,
  duration: gatewayConfig.security.rateLimit.standardWindow,
  blockDuration: 900, // 15 minutes
  keyPrefix: 'rl'
});

app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (error) {
    res.status(429).json({
      success: false,
      error: {
        code: '1000-1999',
        message: 'Too many requests'
      }
    });
  }
});

// Metrics middleware
if (gatewayConfig.server.metrics.enabled) {
  app.use(promMiddleware({
    metricsPath: gatewayConfig.server.metrics.path,
    collectDefaultMetrics: gatewayConfig.server.metrics.collectDefaultMetrics,
    requestDurationBuckets: [0.1, 0.5, 1, 1.5, 2, 3, 5, 10]
  }));
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version
  });
});

// API routes with circuit breakers
const serviceCircuitBreaker = new CircuitBreaker(async (req: Request) => {
  // Circuit breaker logic for service calls
  return Promise.resolve();
}, {
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
});

serviceCircuitBreaker.on('open', () => {
  logger.warn('Circuit breaker opened');
});

serviceCircuitBreaker.on('halfOpen', () => {
  logger.info('Circuit breaker half-opened');
});

serviceCircuitBreaker.on('close', () => {
  logger.info('Circuit breaker closed');
});

// Protected routes
app.use('/api/v1', authenticate);

// Mount service routes
import authRoutes from './routes/auth.routes';
import searchRoutes from './routes/search.routes';
import planningRoutes from './routes/planning.routes';
import visualizationRoutes from './routes/visualization.routes';

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/planning', planningRoutes);
app.use('/api/v1/visualization', visualizationRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Starting graceful shutdown...');
  
  // Close server
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  }
});

// Export app instance
export default app;