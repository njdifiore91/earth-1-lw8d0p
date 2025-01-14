// rate-limiter-flexible v2.4.1 - Enterprise-grade rate limiting
import { RateLimiterOptions } from 'rate-limiter-flexible';
// ioredis v5.3.2 - Enterprise-grade Redis client
import Redis from 'ioredis';

// Type-safe interfaces for configuration
interface RateLimitConfig {
  userRateLimit: RateLimiterOptions;
  adminRateLimit: RateLimiterOptions;
}

interface RedisConfig {
  host: string;
  port: number;
  password: string;
  enableOfflineQueue: boolean;
  connectTimeout: number;
  maxRetriesPerRequest: number;
}

// Rate limiting constants
const USER_POINTS = 100;
const USER_DURATION = 60; // 1 minute in seconds
const ADMIN_POINTS = 1000;
const ADMIN_DURATION = 60;
const BLOCK_DURATION = 60;
const MAX_RETRIES = 3;
const CONNECT_TIMEOUT = 10000;
const INSURANCE_USER_POINTS = 10;
const INSURANCE_ADMIN_POINTS = 100;

// Redis configuration validation
const validateConfig = (config: RateLimiterOptions): boolean => {
  if (!config.points || !config.duration || !config.blockDuration) {
    throw new Error('Missing required rate limiter configuration parameters');
  }

  if (config.points <= 0 || config.duration <= 0 || config.blockDuration <= 0) {
    throw new Error('Rate limiter numeric parameters must be positive');
  }

  if (!config.storeClient) {
    throw new Error('Redis store client is required');
  }

  if (config.insuranceLimiter && 
      (!config.insuranceLimiter.points || !config.insuranceLimiter.duration)) {
    throw new Error('Invalid insurance limiter configuration');
  }

  return true;
};

// Redis client factory with error handling
export const createRedisClient = (): Redis => {
  if (!process.env.REDIS_HOST || !process.env.REDIS_PORT || !process.env.REDIS_PASSWORD) {
    throw new Error('Required Redis environment variables are not set');
  }

  const config: RedisConfig = {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
    enableOfflineQueue: true,
    connectTimeout: CONNECT_TIMEOUT,
    maxRetriesPerRequest: MAX_RETRIES
  };

  const client = new Redis({
    ...config,
    retryStrategy: (times: number) => {
      if (times > MAX_RETRIES) {
        return null; // Stop retrying
      }
      return Math.min(times * 100, 3000); // Exponential backoff
    }
  });

  client.on('error', (err: Error) => {
    console.error('Redis client error:', err);
  });

  client.on('connect', () => {
    console.info('Redis client connected successfully');
  });

  client.on('reconnecting', () => {
    console.warn('Redis client reconnecting...');
  });

  client.on('close', () => {
    console.warn('Redis connection closed');
  });

  return client;
};

// Initialize Redis client
const redisClient = createRedisClient();

// Rate limiting configuration
export const rateLimitConfig: RateLimitConfig = {
  userRateLimit: {
    points: USER_POINTS,
    duration: USER_DURATION,
    blockDuration: BLOCK_DURATION,
    storeClient: redisClient,
    keyPrefix: 'rl_user',
    inmemoryBlockOnConsumed: USER_POINTS,
    inmemoryBlockDuration: BLOCK_DURATION,
    insuranceLimiter: {
      points: INSURANCE_USER_POINTS,
      duration: 60,
      blockDuration: BLOCK_DURATION
    },
    execEvenly: true,
    execEvenlyMinDelayMs: 50
  },
  adminRateLimit: {
    points: ADMIN_POINTS,
    duration: ADMIN_DURATION,
    blockDuration: BLOCK_DURATION,
    storeClient: redisClient,
    keyPrefix: 'rl_admin',
    inmemoryBlockOnConsumed: ADMIN_POINTS,
    inmemoryBlockDuration: BLOCK_DURATION,
    insuranceLimiter: {
      points: INSURANCE_ADMIN_POINTS,
      duration: 60,
      blockDuration: BLOCK_DURATION
    },
    execEvenly: true,
    execEvenlyMinDelayMs: 20
  }
};

// Validate configurations
validateConfig(rateLimitConfig.userRateLimit);
validateConfig(rateLimitConfig.adminRateLimit);

export default rateLimitConfig;