// express v4.18.2 - Web framework
import { Application } from 'express';
// cors v2.8.5 - Cross-Origin Resource Sharing
import cors from 'cors';
// helmet v6.0.1 - Security headers
import helmet from 'helmet';
// compression v1.7.4 - Response compression
import compression from 'compression';
// opossum v6.0.1 - Circuit breaker
import CircuitBreaker from 'opossum';

import { rateLimitConfig } from './rate-limit.config';

// Server configuration interface
interface ServerConfig {
  port: number;
  env: string;
  apiVersion: string;
  metrics: {
    enabled: boolean;
    path: string;
    collectDefaultMetrics: boolean;
  };
  logging: {
    level: string;
    format: string;
    requestLogging: boolean;
  };
}

// Security configuration interface
interface SecurityConfig {
  jwtSecret: string;
  tokenExpiration: number;
  cors: {
    origin: string[];
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    credentials: boolean;
    maxAge: number;
  };
  helmet: {
    contentSecurityPolicy: {
      directives: {
        'default-src': string[];
        'script-src': string[];
        'style-src': string[];
        'img-src': string[];
        'connect-src': string[];
      };
    };
    crossOriginEmbedderPolicy: boolean;
    crossOriginOpenerPolicy: boolean;
    crossOriginResourcePolicy: boolean;
    dnsPrefetchControl: boolean;
    frameguard: boolean;
    hidePoweredBy: boolean;
    hsts: {
      maxAge: number;
      includeSubDomains: boolean;
      preload: boolean;
    };
    ieNoOpen: boolean;
    noSniff: boolean;
    referrerPolicy: boolean;
    xssFilter: boolean;
  };
  rateLimit: {
    enabled: boolean;
    standardWindow: number;
    standardMax: number;
  };
}

// Service configuration interface
interface ServiceConfig {
  auth: MicroserviceConfig;
  search: MicroserviceConfig;
  planning: MicroserviceConfig;
  visualization: MicroserviceConfig;
}

// Microservice configuration interface
interface MicroserviceConfig {
  url: string;
  timeout: number;
  prefix: string;
  healthCheck: string;
  circuitBreaker: {
    enabled: boolean;
    threshold: number;
    timeout: number;
  };
}

// Monitoring configuration interface
interface MonitoringConfig {
  metrics: {
    enabled: boolean;
    prometheus: {
      enabled: boolean;
      path: string;
    };
  };
  tracing: {
    enabled: boolean;
    jaeger: {
      enabled: boolean;
      serviceName: string;
      samplingRate: number;
    };
  };
  healthCheck: {
    enabled: boolean;
    path: string;
    interval: number;
  };
}

// Production-ready gateway configuration
export const gatewayConfig = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    apiVersion: 'v1',
    metrics: {
      enabled: true,
      path: '/metrics',
      collectDefaultMetrics: true
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: 'json',
      requestLogging: true
    }
  } as ServerConfig,

  security: {
    jwtSecret: process.env.JWT_SECRET,
    tokenExpiration: 3600,
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Total-Count'],
      credentials: true,
      maxAge: 86400
    },
    helmet: {
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'https:'],
          'connect-src': ["'self'"]
        }
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: true,
      crossOriginResourcePolicy: true,
      dnsPrefetchControl: true,
      frameguard: true,
      hidePoweredBy: true,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      ieNoOpen: true,
      noSniff: true,
      referrerPolicy: true,
      xssFilter: true
    },
    rateLimit: {
      enabled: true,
      standardWindow: 900000, // 15 minutes
      standardMax: 100
    }
  } as SecurityConfig,

  services: {
    auth: {
      url: process.env.AUTH_SERVICE_URL,
      timeout: 5000,
      prefix: '/auth',
      healthCheck: '/health',
      circuitBreaker: {
        enabled: true,
        threshold: 5,
        timeout: 7000
      }
    },
    search: {
      url: process.env.SEARCH_SERVICE_URL,
      timeout: 10000,
      prefix: '/search',
      healthCheck: '/health',
      circuitBreaker: {
        enabled: true,
        threshold: 3,
        timeout: 12000
      }
    },
    planning: {
      url: process.env.PLANNING_SERVICE_URL,
      timeout: 15000,
      prefix: '/planning',
      healthCheck: '/health',
      circuitBreaker: {
        enabled: true,
        threshold: 3,
        timeout: 17000
      }
    },
    visualization: {
      url: process.env.VISUALIZATION_SERVICE_URL,
      timeout: 10000,
      prefix: '/visualization',
      healthCheck: '/health',
      circuitBreaker: {
        enabled: true,
        threshold: 3,
        timeout: 12000
      }
    }
  } as ServiceConfig,

  monitoring: {
    metrics: {
      enabled: true,
      prometheus: {
        enabled: true,
        path: '/metrics'
      }
    },
    tracing: {
      enabled: true,
      jaeger: {
        enabled: true,
        serviceName: 'api-gateway',
        samplingRate: 0.1
      }
    },
    healthCheck: {
      enabled: true,
      path: '/health',
      interval: 30000
    }
  } as MonitoringConfig
};

// Export rate limit configurations from imported module
export const { userRateLimit, adminRateLimit } = rateLimitConfig;

export default gatewayConfig;