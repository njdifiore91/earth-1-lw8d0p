/**
 * Frontend Logging Middleware for Matter Satellite Platform
 * @version 1.0.0
 * Implements enterprise-grade logging with security monitoring and NewRelic integration
 */

// External imports
import LogLevel from 'loglevel'; // v1.8.1
import * as NewRelic from 'newrelic-browser'; // v1.0.0

// Internal imports
import { ApiService } from '../services/api.service';
import { Environment } from '../types/global';

/**
 * Configuration interface for logging middleware
 */
interface LoggingConfig {
  logLevel: LogLevel.LogLevelDesc;
  enableConsole: boolean;
  enableRemote: boolean;
  enablePerformanceTracking: boolean;
  remoteEndpoint: string;
  securityContext: boolean;
  samplingRate: number;
  retentionPeriod: number;
  bufferSize: number;
}

/**
 * Enhanced interface for structured log entries
 */
interface LogEntry {
  timestamp: Date;
  level: LogLevel.LogLevelDesc;
  message: string;
  context: Record<string, any>;
  tags: string[];
  correlationId: string;
  securityContext?: {
    userId: string;
    sessionId: string;
    ipAddress: string;
    userAgent: string;
  };
  performanceMetrics?: {
    duration: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

/**
 * Default logging configuration
 */
const DEFAULT_CONFIG: LoggingConfig = {
  logLevel: LogLevel.INFO,
  enableConsole: true,
  enableRemote: true,
  enablePerformanceTracking: true,
  remoteEndpoint: '/api/v1/logs',
  securityContext: true,
  samplingRate: 1.0,
  retentionPeriod: 30,
  bufferSize: 1000
};

/**
 * Environment-specific log levels
 */
const LOG_LEVELS = {
  [Environment.DEVELOPMENT]: LogLevel.DEBUG,
  [Environment.PRODUCTION]: LogLevel.INFO,
  SECURITY: LogLevel.WARN,
  PERFORMANCE: LogLevel.INFO
};

/**
 * Creates and configures an enhanced logger instance
 */
export function createLogger(config: Partial<LoggingConfig> = {}): LogLevel.Logger {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const logger = LogLevel.getLogger('matter-platform');

  // Configure log level based on environment
  logger.setLevel(
    window.ENVIRONMENT === Environment.DEVELOPMENT
      ? LOG_LEVELS[Environment.DEVELOPMENT]
      : LOG_LEVELS[Environment.PRODUCTION]
  );

  // Configure console transport
  if (finalConfig.enableConsole) {
    const originalFactory = logger.methodFactory;
    logger.methodFactory = (methodName, level, loggerName) => {
      const rawMethod = originalFactory(methodName, level, loggerName);
      return function (message: string, context?: Record<string, any>) {
        const entry = createLogEntry(methodName as LogLevel.LogLevelDesc, message, context);
        rawMethod(formatLogEntry(entry));
      };
    };
  }

  // Initialize NewRelic if performance tracking is enabled
  if (finalConfig.enablePerformanceTracking) {
    NewRelic.setCustomAttribute('environment', window.ENVIRONMENT);
    NewRelic.setCustomAttribute('appVersion', window.APP_VERSION);
  }

  return logger;
}

/**
 * Logs incoming API requests with security context
 */
export function logRequest(request: Request): void {
  const correlationId = crypto.randomUUID();
  const apiService = ApiService.getInstance();
  
  const entry: LogEntry = {
    timestamp: new Date(),
    level: LOG_LEVELS.SECURITY,
    message: `API Request: ${request.method} ${request.url}`,
    context: {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries())
    },
    tags: ['api', 'request', request.method.toLowerCase()],
    correlationId,
    securityContext: {
      userId: localStorage.getItem('userId') || 'anonymous',
      sessionId: localStorage.getItem('sessionId') || 'unknown',
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: navigator.userAgent
    }
  };

  const logger = LogLevel.getLogger('matter-platform');
  logger.info(entry.message, entry);

  if (window.ENVIRONMENT === Environment.PRODUCTION) {
    NewRelic.addPageAction('apiRequest', {
      correlationId,
      method: request.method,
      url: request.url
    });
  }
}

/**
 * Logs API response data with performance metrics
 */
export function logResponse(response: Response): void {
  const performanceEntry = performance.getEntriesByType('resource').pop();
  
  const entry: LogEntry = {
    timestamp: new Date(),
    level: LOG_LEVELS.PERFORMANCE,
    message: `API Response: ${response.status} ${response.url}`,
    context: {
      status: response.status,
      url: response.url,
      headers: Object.fromEntries(response.headers.entries())
    },
    tags: ['api', 'response', response.status.toString()],
    correlationId: response.headers.get('x-correlation-id') || 'unknown',
    performanceMetrics: {
      duration: performanceEntry?.duration || 0,
      memoryUsage: performance.memory?.usedJSHeapSize || 0,
      cpuUsage: 0 // Not available in browser context
    }
  };

  const logger = LogLevel.getLogger('matter-platform');
  logger.info(entry.message, entry);

  if (window.ENVIRONMENT === Environment.PRODUCTION) {
    NewRelic.addToTrace({
      name: 'apiResponse',
      duration: entry.performanceMetrics.duration,
      status: response.status
    });
  }
}

/**
 * Tracks performance metrics with NewRelic integration
 */
export function trackPerformance(
  operation: string,
  duration: number,
  metrics: Record<string, any>
): void {
  const entry: LogEntry = {
    timestamp: new Date(),
    level: LOG_LEVELS.PERFORMANCE,
    message: `Performance: ${operation}`,
    context: metrics,
    tags: ['performance', operation],
    correlationId: crypto.randomUUID(),
    performanceMetrics: {
      duration,
      memoryUsage: performance.memory?.usedJSHeapSize || 0,
      cpuUsage: 0
    }
  };

  const logger = LogLevel.getLogger('matter-platform');
  logger.info(entry.message, entry);

  if (window.ENVIRONMENT === Environment.PRODUCTION) {
    NewRelic.addToTrace({
      name: operation,
      duration,
      ...metrics
    });
  }
}

/**
 * Creates a structured log entry
 */
function createLogEntry(
  level: LogLevel.LogLevelDesc,
  message: string,
  context?: Record<string, any>
): LogEntry {
  return {
    timestamp: new Date(),
    level,
    message,
    context: context || {},
    tags: [],
    correlationId: crypto.randomUUID()
  };
}

/**
 * Formats a log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  return `[${entry.timestamp.toISOString()}] [${entry.level}] ${entry.message} ${
    Object.keys(entry.context).length ? `\nContext: ${JSON.stringify(entry.context, null, 2)}` : ''
  }`;
}

export default {
  createLogger,
  logRequest,
  logResponse,
  trackPerformance
};