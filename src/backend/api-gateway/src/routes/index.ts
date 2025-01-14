// express v4.18.2
import { Application, Request, Response, NextFunction } from 'express';
// http-proxy-middleware v2.0.6
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';
import { RateLimit } from 'rate-limiter-flexible';
import { StatusCodes } from 'http-status-codes';
import CircuitBreaker from 'opossum';
import { WebSocket } from 'ws';

import { gatewayConfig } from '../config/gateway.config';
import { authenticate, authorizeRole, AuthenticatedRequest } from '../middleware/auth.middleware';
import { ApiError, ERROR_CODES, formatError } from '../utils/error.utils';

// Route constants
const PUBLIC_ROUTES = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/forgot-password',
  '/api/v1/health',
  '/api/v1/version'
];

const ADMIN_ROUTES = [
  '/api/v1/admin/*',
  '/api/v1/metrics/*',
  '/api/v1/system/*'
];

/**
 * Creates a proxy middleware for a microservice with circuit breaking and monitoring
 */
const createServiceProxy = (serviceConfig: typeof gatewayConfig.services.auth): RequestHandler => {
  // Circuit breaker configuration
  const breaker = new CircuitBreaker(async (req: Request) => {
    const proxy = createProxyMiddleware({
      target: serviceConfig.url,
      changeOrigin: true,
      pathRewrite: { [`^${serviceConfig.prefix}`]: '' },
      timeout: serviceConfig.timeout,
      proxyTimeout: serviceConfig.timeout,
      onError: (err, req, res) => {
        throw new ApiError(
          'Service unavailable',
          StatusCodes.SERVICE_UNAVAILABLE,
          ERROR_CODES.SYSTEM_ERROR,
          { service: serviceConfig.prefix }
        );
      }
    });
    return proxy;
  }, {
    timeout: serviceConfig.circuitBreaker.timeout,
    errorThresholdPercentage: serviceConfig.circuitBreaker.threshold,
    resetTimeout: 30000
  });

  // Circuit breaker event handlers
  breaker.on('open', () => {
    console.error(`Circuit breaker opened for service: ${serviceConfig.prefix}`);
  });

  breaker.on('halfOpen', () => {
    console.info(`Circuit breaker half-open for service: ${serviceConfig.prefix}`);
  });

  breaker.on('close', () => {
    console.info(`Circuit breaker closed for service: ${serviceConfig.prefix}`);
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proxy = await breaker.fire(req);
      proxy(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Configures all API routes with security, monitoring and error handling
 */
export const setupRoutes = (app: Application): void => {
  const apiPrefix = `/api/${gatewayConfig.server.apiVersion}`;

  // Health check endpoint
  app.get(`${apiPrefix}/health`, (req: Request, res: Response) => {
    res.status(StatusCodes.OK).json({ status: 'healthy' });
  });

  // Version endpoint
  app.get(`${apiPrefix}/version`, (req: Request, res: Response) => {
    res.status(StatusCodes.OK).json({ version: process.env.APP_VERSION || '1.0.0' });
  });

  // Authentication service routes
  app.use(
    `${apiPrefix}/auth`,
    createServiceProxy(gatewayConfig.services.auth)
  );

  // Protected routes middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (PUBLIC_ROUTES.some(route => req.path.startsWith(route))) {
      return next();
    }
    authenticate(req as AuthenticatedRequest, res, next);
  });

  // Search service routes
  app.use(
    `${apiPrefix}/search`,
    createServiceProxy(gatewayConfig.services.search)
  );

  // Planning service routes
  app.use(
    `${apiPrefix}/planning`,
    createServiceProxy(gatewayConfig.services.planning)
  );

  // Visualization service routes
  app.use(
    `${apiPrefix}/visualization`,
    createServiceProxy(gatewayConfig.services.visualization)
  );

  // Admin routes with role authorization
  app.use(
    ADMIN_ROUTES,
    authorizeRole(['admin'], {
      requireAllPermissions: true,
      resourceAccess: ['system:admin', 'metrics:view']
    })
  );

  // WebSocket upgrade handling
  app.on('upgrade', (request: Request, socket: WebSocket, head: Buffer) => {
    const path = request.url;
    if (path?.startsWith(`${apiPrefix}/planning/ws`)) {
      const wsServer = createProxyMiddleware({
        target: gatewayConfig.services.planning.url,
        ws: true,
        changeOrigin: true
      });
      wsServer.upgrade(request, socket, head);
    }
  });

  // Global error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    const errorResponse = formatError(err, process.env.NODE_ENV === 'development');
    const statusCode = err instanceof ApiError ? err.statusCode : StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(statusCode).json(errorResponse);
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(StatusCodes.NOT_FOUND).json({
      code: ERROR_CODES.SYSTEM_ERROR,
      message: 'Resource not found',
      isOperational: true
    });
  });
};