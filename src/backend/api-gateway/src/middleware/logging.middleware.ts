import { Request, Response, NextFunction } from 'express'; // v4.18.2
import * as winston from 'winston'; // v3.9.0
import { ElasticsearchTransport } from 'winston-elasticsearch'; // v0.17.1
import morgan from 'morgan'; // v1.10.0
import { v4 as uuidv4 } from 'uuid'; // v9.0.0
import DailyRotateFile from 'winston-daily-rotate-file'; // v4.7.1
import { formatError } from '../utils/error.utils';
import { gatewayConfig } from '../config/gateway.config';

// Logging levels with numeric priorities
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
  trace: 5
} as const;

// Fields that should be masked in logs
const SENSITIVE_FIELDS = ['password', 'token', 'apiKey', 'secret'];

// Enhanced logger configuration interface
interface LoggerConfig {
  level: string;
  enableConsole: boolean;
  enableFile: boolean;
  enableELK: boolean;
  rotationSize: number;
  retentionDays: number;
  elkHost: string;
  elkIndex: string;
  enableSampling: boolean;
  samplingRate: number;
}

// Extended request interface with tracing
interface RequestWithId extends Request {
  id: string;
  startTime: number;
  metrics: {
    duration?: number;
    statusCode?: number;
    bytesRead?: number;
    bytesWritten?: number;
  };
}

// Create production-grade Winston logger
const createLogger = (config: LoggerConfig): winston.Logger => {
  const transports: winston.transport[] = [];

  // Custom log format with request context
  const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  // Console transport for development
  if (config.enableConsole) {
    transports.push(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }

  // Rotating file transport for production logs
  if (config.enableFile) {
    transports.push(new DailyRotateFile({
      filename: 'logs/api-gateway-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: `${config.rotationSize}m`,
      maxFiles: `${config.retentionDays}d`,
      format: logFormat
    }));

    // Separate transport for error logs
    transports.push(new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: `${config.rotationSize}m`,
      maxFiles: `${config.retentionDays}d`,
      level: 'error',
      format: logFormat
    }));
  }

  // ELK Stack integration for production
  if (config.enableELK) {
    transports.push(new ElasticsearchTransport({
      level: 'info',
      clientOpts: { node: config.elkHost },
      indexPrefix: config.elkIndex,
      bufferLimit: 100,
      ensureMappingTemplate: true,
      flushInterval: 2000
    }));
  }

  return winston.createLogger({
    level: config.level,
    levels: LOG_LEVELS,
    format: logFormat,
    transports,
    exitOnError: false
  });
};

// Initialize logger with configuration
const logger = createLogger({
  level: gatewayConfig.server.logging.level,
  enableConsole: process.env.NODE_ENV !== 'production',
  enableFile: process.env.NODE_ENV === 'production',
  enableELK: process.env.NODE_ENV === 'production',
  rotationSize: 50,
  retentionDays: 30,
  elkHost: process.env.ELK_HOST || 'http://localhost:9200',
  elkIndex: 'api-gateway-logs',
  enableSampling: true,
  samplingRate: 0.1
});

// Enhanced request logging middleware
export const requestLoggingMiddleware = (
  req: RequestWithId,
  res: Response,
  next: NextFunction
): void => {
  // Generate unique request ID
  req.id = uuidv4();
  req.startTime = Date.now();
  req.metrics = {};

  // Sanitize request data
  const sanitizedReq = {
    id: req.id,
    method: req.method,
    url: req.url,
    headers: { ...req.headers },
    query: { ...req.query },
    body: { ...req.body }
  };

  // Mask sensitive data
  SENSITIVE_FIELDS.forEach(field => {
    if (sanitizedReq.body[field]) sanitizedReq.body[field] = '***';
    if (sanitizedReq.query[field]) sanitizedReq.query[field] = '***';
  });

  // Log incoming request
  logger.info('Incoming request', { request: sanitizedReq });

  // Track response metrics
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: string | undefined, cb?: (() => void) | undefined): Response {
    req.metrics.duration = Date.now() - req.startTime;
    req.metrics.statusCode = res.statusCode;
    req.metrics.bytesWritten = res.getHeader('content-length') ? 
      parseInt(res.getHeader('content-length') as string) : 0;

    // Log response metrics
    logger.info('Request completed', {
      requestId: req.id,
      metrics: req.metrics,
      statusCode: res.statusCode
    });

    return originalEnd.call(this, chunk, encoding, cb);
  };

  next();
};

// Enhanced error logging middleware
export const errorLoggingMiddleware = (
  error: Error,
  req: RequestWithId,
  res: Response,
  next: NextFunction
): void => {
  const formattedError = formatError(error, process.env.NODE_ENV === 'development');

  // Enhance error context with request data
  const errorContext = {
    requestId: req.id,
    url: req.url,
    method: req.method,
    metrics: req.metrics,
    timestamp: new Date().toISOString()
  };

  // Log error with context
  logger.error('Request error', {
    error: formattedError,
    context: errorContext
  });

  next(error);
};

// Export configured logger instance
export const loggerInstance = logger;