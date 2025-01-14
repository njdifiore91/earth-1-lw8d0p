import { StatusCodes } from 'http-status-codes'; // v2.2.0
import * as winston from 'winston'; // v3.9.0

/**
 * Standardized error code ranges for different error categories
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: '1000-1999',
  AUTHENTICATION_ERROR: '2000-2999',
  AUTHORIZATION_ERROR: '3000-3999',
  BUSINESS_ERROR: '4000-4999',
  SYSTEM_ERROR: '5000-5999'
} as const;

/**
 * Default secure error messages for common error scenarios
 */
export const DEFAULT_ERROR_MESSAGES = {
  VALIDATION: 'Invalid request parameters',
  AUTHENTICATION: 'Authentication failed',
  AUTHORIZATION: 'Unauthorized access',
  SYSTEM: 'Internal server error'
} as const;

/**
 * Interface defining the structure of standardized API error responses
 */
export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
  serviceName?: string;
  context?: Record<string, unknown>;
  isOperational: boolean;
}

/**
 * Enhanced custom error class for standardized API error handling
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly serviceName?: string;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR,
    code: string = ERROR_CODES.SYSTEM_ERROR,
    details?: Record<string, unknown>,
    serviceName?: string,
    isOperational: boolean = true
  ) {
    // Sanitize message before passing to parent constructor
    super(message.replace(/[^\w\s-]/gi, ''));

    // Set error name and properties
    this.name = 'ApiError';
    this.statusCode = this.validateStatusCode(statusCode);
    this.code = this.validateErrorCode(code);
    this.details = this.sanitizeErrorDetails(details);
    this.serviceName = serviceName;
    this.isOperational = isOperational;

    // Capture stack trace securely
    Error.captureStackTrace(this, this.constructor);

    // Freeze the error instance for immutability
    Object.freeze(this);
  }

  private validateStatusCode(statusCode: number): number {
    return Object.values(StatusCodes).includes(statusCode) 
      ? statusCode 
      : StatusCodes.INTERNAL_SERVER_ERROR;
  }

  private validateErrorCode(code: string): string {
    const validRanges = Object.values(ERROR_CODES);
    return validRanges.includes(code) ? code : ERROR_CODES.SYSTEM_ERROR;
  }

  private sanitizeErrorDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!details) return undefined;
    
    // Deep clone and sanitize details object
    const sanitized = JSON.parse(JSON.stringify(details));
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key'];
    const sanitizeObject = (obj: Record<string, unknown>) => {
      for (const key of Object.keys(obj)) {
        if (sensitiveFields.includes(key.toLowerCase())) {
          delete obj[key];
        } else if (typeof obj[key] === 'object') {
          sanitizeObject(obj[key] as Record<string, unknown>);
        }
      }
    };
    
    sanitizeObject(sanitized);
    return sanitized;
  }
}

/**
 * Formats error object into standardized API response format
 */
export function formatError(error: Error, includeStack: boolean = false): ApiErrorResponse {
  const isApiError = error instanceof ApiError;
  const response: ApiErrorResponse = {
    code: isApiError ? (error as ApiError).code : ERROR_CODES.SYSTEM_ERROR,
    message: error.message || DEFAULT_ERROR_MESSAGES.SYSTEM,
    isOperational: isApiError ? (error as ApiError).isOperational : false
  };

  if (isApiError) {
    const apiError = error as ApiError;
    if (apiError.details) response.details = apiError.details;
    if (apiError.serviceName) response.serviceName = apiError.serviceName;
    if (apiError.context) response.context = apiError.context;
  }

  // Include stack trace only in development and if explicitly requested
  if (includeStack && process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  // Log error with appropriate level
  const logger = winston.createLogger({
    level: isApiError ? 'warn' : 'error',
    format: winston.format.json(),
    transports: [new winston.transports.Console()]
  });

  logger.log({
    level: isApiError ? 'warn' : 'error',
    message: error.message,
    error: response
  });

  return response;
}

/**
 * Enhanced service error handler with context preservation
 */
export function handleServiceError(
  error: Error,
  serviceName: string,
  context?: Record<string, unknown>
): ApiError {
  // Validate service name
  if (!serviceName) {
    throw new Error('Service name is required for error handling');
  }

  let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  let errorCode = ERROR_CODES.SYSTEM_ERROR;
  let isOperational = true;

  // Map service-specific error codes
  if (error instanceof ApiError) {
    return error;
  } else if (error.name === 'ValidationError') {
    statusCode = StatusCodes.BAD_REQUEST;
    errorCode = ERROR_CODES.VALIDATION_ERROR;
  } else if (error.name === 'UnauthorizedError') {
    statusCode = StatusCodes.UNAUTHORIZED;
    errorCode = ERROR_CODES.AUTHENTICATION_ERROR;
  } else {
    isOperational = false;
  }

  return new ApiError(
    error.message,
    statusCode,
    errorCode,
    context,
    serviceName,
    isOperational
  );
}

/**
 * Advanced error type checker with enhanced categorization
 */
export function isOperationalError(error: Error, context?: Record<string, unknown>): boolean {
  if (error instanceof ApiError) {
    return error.isOperational;
  }

  // Analyze error category based on name and context
  const operationalErrorTypes = [
    'ValidationError',
    'UnauthorizedError',
    'ForbiddenError',
    'NotFoundError',
    'ConflictError',
    'TimeoutError'
  ];

  if (operationalErrorTypes.includes(error.name)) {
    return true;
  }

  // Check error code ranges if available in context
  if (context?.errorCode && typeof context.errorCode === 'string') {
    const code = context.errorCode as string;
    return !code.startsWith('5'); // 5xxx are system errors
  }

  return false;
}