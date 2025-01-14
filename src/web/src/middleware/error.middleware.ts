// External imports with version specifications
import { AxiosError } from 'axios'; // v1.x
import * as winston from 'winston'; // v3.x

// Internal imports
import { ApiError } from '../types/api.types';

/**
 * Configuration interface for error middleware with enhanced options
 */
interface ErrorMiddlewareConfig {
  logErrors: boolean;
  includeStackTrace: boolean;
  defaultErrorMessage: string;
  environment: 'development' | 'production';
  enableMetrics: boolean;
  localization: boolean;
}

/**
 * Interface for error tracking metadata
 */
interface ErrorMetadata {
  requestId: string;
  timestamp: number;
  source: string;
  severity: 'error' | 'warning' | 'critical';
  userId?: string;
  sessionId?: string;
}

/**
 * Mapping of HTTP status codes to application error codes
 */
const HTTP_STATUS_ERROR_MAP: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'AUTHENTICATION_ERROR',
  403: 'AUTHORIZATION_ERROR',
  404: 'NOT_FOUND',
  408: 'TIMEOUT_ERROR',
  429: 'RATE_LIMIT_ERROR',
  500: 'SERVER_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE'
};

/**
 * Error severity levels for monitoring and alerting
 */
const ERROR_SEVERITY_LEVELS: Record<string, string> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Default error message for production environment
 */
const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred. Please try again later.';

// Configure winston logger
const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log' })
  ]
});

/**
 * Generates a unique request ID for error tracking
 */
const generateRequestId = (): string => {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Maps HTTP status codes to application error codes
 */
const mapHttpStatusToErrorCode = (statusCode: number): string => {
  const errorCode = HTTP_STATUS_ERROR_MAP[statusCode];
  if (!errorCode) {
    logger.warn(`Unmapped status code: ${statusCode}`);
    return 'SERVER_ERROR';
  }
  return errorCode;
};

/**
 * Transforms Axios errors into the standard API error format
 */
const transformAxiosError = (error: AxiosError, config: ErrorMiddlewareConfig): ApiError => {
  const statusCode = error.response?.status || 500;
  const errorCode = mapHttpStatusToErrorCode(statusCode);
  
  const errorDetails: Record<string, any> = {
    url: error.config?.url,
    method: error.config?.method,
    statusCode,
    statusText: error.response?.statusText,
    headers: error.config?.headers
  };

  // Sanitize sensitive information in development
  if (config.environment === 'development') {
    errorDetails.request = {
      data: error.config?.data,
      params: error.config?.params
    };
    errorDetails.response = {
      data: error.response?.data
    };
  }

  return {
    code: errorCode as any,
    message: error.response?.data?.message || error.message,
    details: errorDetails,
    timestamp: new Date().toISOString()
  };
};

/**
 * Main error handling middleware function
 */
const handleError = (error: Error | AxiosError, config: ErrorMiddlewareConfig): ApiError => {
  const requestId = generateRequestId();
  const timestamp = Date.now();

  // Create error metadata for tracking
  const metadata: ErrorMetadata = {
    requestId,
    timestamp,
    source: 'frontend',
    severity: 'error'
  };

  // Transform error based on type
  let transformedError: ApiError;
  if (axios.isAxiosError(error)) {
    transformedError = transformAxiosError(error, config);
  } else {
    transformedError = {
      code: 'SERVER_ERROR',
      message: config.environment === 'development' ? error.message : config.defaultErrorMessage,
      details: {},
      timestamp: new Date().toISOString()
    };
  }

  // Add stack trace in development
  if (config.environment === 'development' && config.includeStackTrace) {
    transformedError.details.stack = error.stack;
  }

  // Log error with metadata
  if (config.logErrors) {
    logger.error('Frontend Error', {
      error: transformedError,
      metadata,
      stack: error.stack
    });
  }

  // Track error metrics if enabled
  if (config.enableMetrics) {
    trackErrorMetrics(transformedError, metadata);
  }

  return transformedError;
};

/**
 * Tracks error metrics for monitoring and alerting
 */
const trackErrorMetrics = (error: ApiError, metadata: ErrorMetadata): void => {
  // Implementation would depend on monitoring service (e.g., New Relic, Datadog)
  console.info('Error metrics tracked:', {
    errorCode: error.code,
    timestamp: metadata.timestamp,
    severity: metadata.severity
  });
};

/**
 * Default error middleware configuration
 */
const defaultConfig: ErrorMiddlewareConfig = {
  logErrors: true,
  includeStackTrace: false,
  defaultErrorMessage: DEFAULT_ERROR_MESSAGE,
  environment: process.env.NODE_ENV as 'development' | 'production',
  enableMetrics: true,
  localization: true
};

/**
 * Export error handling middleware with default configuration
 */
export default function errorMiddleware(error: Error | AxiosError, config: Partial<ErrorMiddlewareConfig> = {}): ApiError {
  return handleError(error, { ...defaultConfig, ...config });
}

// Export additional utilities for external use
export {
  ErrorMiddlewareConfig,
  ErrorMetadata,
  HTTP_STATUS_ERROR_MAP,
  ERROR_SEVERITY_LEVELS
};