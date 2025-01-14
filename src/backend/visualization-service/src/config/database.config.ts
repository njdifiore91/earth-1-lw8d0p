// @ts-nocheck
import { Pool, PoolConfig } from 'pg'; // pg v8.11.0

/**
 * Comprehensive database configuration interface for the visualization service
 */
export interface VisualizationDatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  poolConfig?: Partial<PoolConfig>;
  queryTimeout?: number;
  statementTimeout?: number;
  enablePostgis?: boolean;
  sslConfig?: {
    rejectUnauthorized?: boolean;
    requestCert?: boolean;
    ca?: string;
    checkServerIdentity?: boolean;
    minVersion?: string;
  };
  retryConfig?: {
    retries: number;
    factor: number;
    minTimeout: number;
    maxTimeout: number;
  };
}

/**
 * Default connection pool configuration optimized for visualization workloads
 */
export const DEFAULT_POOL_CONFIG: PoolConfig = {
  max: 20, // Maximum number of clients in the pool
  min: 5, // Minimum number of idle clients maintained in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if a connection cannot be established
  statement_timeout: 10000, // Cancel any statement that takes more than 10 seconds
  query_timeout: 15000, // Cancel any query that takes more than 15 seconds
  allowExitOnIdle: false, // Prevent the pool from closing when idle
  maxUses: 7500, // Number of times a client can be used before being recycled
  application_name: 'visualization_service' // Identifier for monitoring and logging
};

/**
 * Default SSL configuration with TLS 1.3 and certificate validation
 */
export const DEFAULT_SSL_CONFIG = {
  rejectUnauthorized: true,
  requestCert: true,
  ca: '/etc/ssl/certs/postgresql.crt',
  checkServerIdentity: true,
  minVersion: 'TLSv1.3'
};

/**
 * Default retry configuration for connection attempts
 */
export const DEFAULT_RETRY_CONFIG = {
  retries: 3,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 5000
};

/**
 * Validates the database configuration parameters
 * @param config Database configuration object
 * @throws Error if configuration is invalid
 */
export function validateVisualizationDatabaseConfig(config: VisualizationDatabaseConfig): boolean {
  if (!config.host || typeof config.host !== 'string') {
    throw new Error('Invalid host configuration');
  }

  if (!config.port || config.port < 1024 || config.port > 65535) {
    throw new Error('Invalid port number. Must be between 1024 and 65535');
  }

  if (!config.database || typeof config.database !== 'string') {
    throw new Error('Invalid database name');
  }

  if (!config.user || !config.password) {
    throw new Error('Database credentials are required');
  }

  if (config.ssl && config.sslConfig) {
    if (config.sslConfig.minVersion && config.sslConfig.minVersion < 'TLSv1.3') {
      throw new Error('Minimum TLS version must be 1.3 or higher');
    }
  }

  return true;
}

/**
 * Creates and configures a PostgreSQL connection pool for the visualization service
 * @param config Database configuration options
 * @returns Configured PostgreSQL pool instance
 */
export function createVisualizationDatabasePool(config: VisualizationDatabaseConfig): Pool {
  // Validate configuration
  validateVisualizationDatabaseConfig(config);

  // Merge default pool configuration with provided options
  const poolConfig: PoolConfig = {
    ...DEFAULT_POOL_CONFIG,
    ...config.poolConfig,
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? {
      ...DEFAULT_SSL_CONFIG,
      ...config.sslConfig
    } : false
  };

  // Create pool instance
  const pool = new Pool(poolConfig);

  // Configure statement and query timeouts
  pool.on('connect', (client) => {
    client.query(`
      SET statement_timeout TO ${config.statementTimeout || DEFAULT_POOL_CONFIG.statement_timeout};
      SET idle_in_transaction_session_timeout TO ${poolConfig.idleTimeoutMillis};
      ${config.enablePostgis ? 'CREATE EXTENSION IF NOT EXISTS postgis;' : ''}
    `);
  });

  // Error handling
  pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    if (client) {
      client.release(true); // Release with error
    }
  });

  // Connection monitoring
  pool.on('acquire', () => {
    if (pool.totalCount >= poolConfig.max * 0.8) {
      console.warn('Pool reaching maximum capacity');
    }
  });

  return pool;
}