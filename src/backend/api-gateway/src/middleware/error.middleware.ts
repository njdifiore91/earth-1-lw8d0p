import { Request, Response, NextFunction } from 'express'; // v4.18.2
import { StatusCodes } from 'http-status-codes'; // v2.2.0
import * as winston from 'winston'; // v3.8.2
import * as Sentry from '@sentry/node'; // v7.0.0
import { ApiError, formatError } from '../utils/error.utils';

// Constants for error handling configuration
const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred';

const LOG_LEVELS = {
  OPERATIONAL: 'warn',
  PROGRAMMING: 'error',
  SECURITY: 'error',
  SYSTEM: 'error'
} as const;

const ERROR_RATE_LIMIT = {
  windowMs: 60000, // 1 minute
  max: 100 // maximum 100 errors per minute
} as const;

// Initialize Winston logger with severity levels
const logger = winston.createLogger({
  levels: winston.config.syslog.levels,
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

/**
 * Determines error severity based on error type and code range
 */
const determineErrorSeverity = (error: ApiError | Error): keyof typeof LOG_LEVELS => {
  if (error instanceof ApiError) {
    const code = parseInt(error.code.split('-')[0]);
    if (code >= 1000 && code < 2000) return 'OPERATIONAL'; // Validation errors
    if (code >= 2000 && code < 4000) return 'SECURITY'; // Auth errors
    if (code >= 4000 && code < 5000) return 'OPERATIONAL'; // Business errors
    return 'SYSTEM'; // System errors (5000+)
  }
  return 'PROGRAMMING';
};

/**
 * Centralized error handling middleware for API Gateway
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Transform unknown errors to ApiError
  const apiError = error instanceof ApiError
    ? error
    : new ApiError(
        error.message || DEFAULT_ERROR_MESSAGE,
        StatusCodes.INTERNAL_SERVER_ERROR,
        '5000-5999',
        undefined,
        'api-gateway',
        false
      );

  // Determine severity and log error
  const severity = determineErrorSeverity(apiError);
  logger.log({
    level: LOG_LEVELS[severity],
    message: apiError.message,
    error: {
      code: apiError.code,
      stack: apiError.stack,
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id'],
      userId: req.headers['x-user-id']
    }
  });

  // Track non-operational errors in Sentry
  if (!apiError.isOperational) {
    Sentry.captureException(error, {
      level: Sentry.Severity.Error,
      tags: {
        path: req.path,
        method: req.method,
        errorCode: apiError.code
      },
      extra: {
        requestId: req.headers['x-request-id'],
        userId: req.headers['x-user-id']
      }
    });
  }

  // Format error response
  const errorResponse = formatError(apiError, process.env.NODE_ENV === 'development');

  // Send error response
  res.status(apiError.statusCode).json({
    success: false,
    error: errorResponse
  });
};

/**
 * Middleware to handle 404 Not Found errors
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const notFoundError = new ApiError(
    `Resource not found: ${req.path}`,
    StatusCodes.NOT_FOUND,
    '4000-4999',
    {
      path: req.path,
      method: req.method
    },
    'api-gateway',
    true
  );

  logger.warn({
    message: `404 Not Found: ${req.path}`,
    method: req.method,
    requestId: req.headers['x-request-id'],
    userId: req.headers['x-user-id']
  });

  next(notFoundError);
};