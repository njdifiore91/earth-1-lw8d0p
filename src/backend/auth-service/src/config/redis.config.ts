import Redis, { RedisOptions } from 'ioredis'; // v5.3.0

/**
 * Interface defining Redis configuration options for the authentication service
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  tls: boolean;
  clusterConfig?: {
    nodes: Array<{ host: string; port: number; }>;
    replicas: number;
    enableReadyCheck: boolean;
    scaleReads: number;
  };
  sentinelConfig?: {
    sentinels: Array<{ host: string; port: number; }>;
    name: string;
    role: 'master' | 'slave';
  };
  rateLimitConfig: {
    maxRequests: number;
    windowMs: number;
    keyPrefix: string;
  };
  healthCheck: {
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
  };
  retryStrategy: {
    maxRetries: number;
    retryTimeMs: number;
    exponentialBackoff: boolean;
  };
}

/**
 * Default Redis configuration with production-ready settings
 */
export const DEFAULT_REDIS_CONFIG: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  tls: process.env.REDIS_TLS === 'true',
  keyPrefix: 'auth:',
  rateLimitConfig: {
    maxRequests: 100,
    windowMs: 60000, // 1 minute
    keyPrefix: 'ratelimit:'
  },
  healthCheck: {
    enabled: true,
    intervalMs: 30000, // 30 seconds
    timeoutMs: 5000 // 5 seconds
  },
  retryStrategy: {
    maxRetries: 5,
    retryTimeMs: 1000,
    exponentialBackoff: true
  }
};

/**
 * Validates Redis configuration parameters
 * @param config Redis configuration object
 * @returns boolean indicating if configuration is valid
 * @throws Error if configuration is invalid
 */
export function validateRedisConfig(config: RedisConfig): boolean {
  if (!config.host || !config.port) {
    throw new Error('Redis host and port are required');
  }

  if (config.port < 1 || config.port > 65535) {
    throw new Error('Invalid Redis port number');
  }

  if (config.clusterConfig) {
    if (!Array.isArray(config.clusterConfig.nodes) || config.clusterConfig.nodes.length === 0) {
      throw new Error('Cluster configuration requires at least one node');
    }
    
    for (const node of config.clusterConfig.nodes) {
      if (!node.host || !node.port) {
        throw new Error('Invalid cluster node configuration');
      }
    }
  }

  if (config.sentinelConfig) {
    if (!Array.isArray(config.sentinelConfig.sentinels) || config.sentinelConfig.sentinels.length === 0) {
      throw new Error('Sentinel configuration requires at least one sentinel');
    }
    if (!config.sentinelConfig.name) {
      throw new Error('Sentinel master name is required');
    }
  }

  if (config.rateLimitConfig) {
    if (config.rateLimitConfig.maxRequests <= 0 || config.rateLimitConfig.windowMs <= 0) {
      throw new Error('Invalid rate limit configuration');
    }
  }

  return true;
}

/**
 * Creates and configures a Redis client instance
 * @param config Redis configuration options
 * @returns Configured Redis client instance
 */
export function createRedisClient(config: Partial<RedisConfig> = {}): Redis {
  const finalConfig: RedisConfig = {
    ...DEFAULT_REDIS_CONFIG,
    ...config
  };

  validateRedisConfig(finalConfig);

  const redisOptions: RedisOptions = {
    host: finalConfig.host,
    port: finalConfig.port,
    password: finalConfig.password,
    db: finalConfig.db,
    tls: finalConfig.tls ? {} : undefined,
    keyPrefix: finalConfig.keyPrefix,
    maxRetriesPerRequest: finalConfig.retryStrategy.maxRetries,
    enableReadyCheck: true,
    showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
    retryStrategy: (times: number) => {
      if (times > finalConfig.retryStrategy.maxRetries) {
        return null;
      }
      const delay = finalConfig.retryStrategy.exponentialBackoff
        ? finalConfig.retryStrategy.retryTimeMs * Math.pow(2, times - 1)
        : finalConfig.retryStrategy.retryTimeMs;
      return Math.min(delay, 30000); // Max 30 second delay
    }
  };

  let client: Redis;

  if (finalConfig.clusterConfig) {
    client = new Redis.Cluster(
      finalConfig.clusterConfig.nodes,
      {
        ...redisOptions,
        scaleReads: finalConfig.clusterConfig.scaleReads,
        enableReadyCheck: finalConfig.clusterConfig.enableReadyCheck,
        redisOptions
      }
    );
  } else if (finalConfig.sentinelConfig) {
    client = new Redis({
      ...redisOptions,
      sentinels: finalConfig.sentinelConfig.sentinels,
      name: finalConfig.sentinelConfig.name,
      role: finalConfig.sentinelConfig.role
    });
  } else {
    client = new Redis(redisOptions);
  }

  // Set up event handlers
  client.on('connect', () => {
    console.info('Redis client connected');
  });

  client.on('error', (err) => {
    console.error('Redis client error:', err);
  });

  client.on('close', () => {
    console.warn('Redis client connection closed');
  });

  // Set up health check if enabled
  if (finalConfig.healthCheck.enabled) {
    const healthCheck = setInterval(async () => {
      try {
        const ping = await Promise.race([
          client.ping(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 
            finalConfig.healthCheck.timeoutMs)
          )
        ]);
        if (ping !== 'PONG') {
          throw new Error('Invalid ping response');
        }
      } catch (error) {
        console.error('Redis health check failed:', error);
        client.emit('error', error);
      }
    }, finalConfig.healthCheck.intervalMs);

    client.on('close', () => {
      clearInterval(healthCheck);
    });
  }

  return client;
}