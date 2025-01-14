// @ts-check
import { Pool, PoolConfig } from 'pg'; // pg version ^8.11.0

/**
 * SSL/TLS configuration interface for secure database connections
 */
interface SSLConfig {
  rejectUnauthorized: boolean;
  ca?: string;
  key?: string;
  cert?: string;
  protocol: string;
}

/**
 * Read replica configuration interface for high availability
 */
interface ReplicaConfig {
  hosts: string[];
  readPreference: number;
  autoFailover: boolean;
}

/**
 * Monitoring configuration interface for connection pool metrics
 */
interface MonitoringConfig {
  enableMetrics: boolean;
  labelPrefix: string;
  sampleInterval: number;
}

/**
 * Comprehensive database configuration interface
 */
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  poolConfig?: PoolConfig;
  replicaConfig?: ReplicaConfig;
  sslConfig?: SSLConfig;
  monitoringConfig?: MonitoringConfig;
}

/**
 * Default pool configuration with production-ready settings
 */
const DEFAULT_POOL_CONFIG: PoolConfig = {
  max: 20,                           // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,         // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000,     // Connection timeout after 2 seconds
  allowExitOnIdle: false,           // Prevent pool shutdown on idle
  maxUses: 7500,                    // Maximum uses before client is destroyed
  statement_timeout: 60000,         // Statement timeout after 60 seconds
  query_timeout: 30000              // Query timeout after 30 seconds
};

/**
 * Default SSL configuration with strict security settings
 */
const DEFAULT_SSL_CONFIG: SSLConfig = {
  rejectUnauthorized: true,
  protocol: 'TLSv1.3',
  minVersion: 'TLSv1.2'
};

/**
 * Validates database configuration parameters
 * @param config Database configuration object
 * @returns Validation result with status and messages
 */
function validateDatabaseConfig(config: DatabaseConfig): { isValid: boolean; messages: string[] } {
  const messages: string[] = [];

  // Required parameter validation
  if (!config.host) messages.push('Database host is required');
  if (!config.database) messages.push('Database name is required');
  if (!config.user) messages.push('Database user is required');
  if (!config.password) messages.push('Database password is required');

  // Port validation
  if (!config.port || config.port < 1 || config.port > 65535) {
    messages.push('Invalid port number. Must be between 1 and 65535');
  }

  // SSL validation for production
  if (process.env.NODE_ENV === 'production' && !config.ssl) {
    messages.push('SSL must be enabled in production environment');
  }

  // Replica configuration validation
  if (config.replicaConfig) {
    if (!Array.isArray(config.replicaConfig.hosts) || config.replicaConfig.hosts.length === 0) {
      messages.push('Replica hosts must be a non-empty array');
    }
  }

  return {
    isValid: messages.length === 0,
    messages
  };
}

/**
 * Creates and configures a PostgreSQL connection pool with enhanced security and monitoring
 * @param config Database configuration object
 * @returns Configured PostgreSQL connection pool
 * @throws Error if configuration validation fails
 */
function createDatabasePool(config: DatabaseConfig): Pool {
  // Validate configuration
  const validation = validateDatabaseConfig(config);
  if (!validation.isValid) {
    throw new Error(`Invalid database configuration: ${validation.messages.join(', ')}`);
  }

  // Merge pool configurations
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

  // Set up error handling
  pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
  });

  // Set up connection monitoring
  if (config.monitoringConfig?.enableMetrics) {
    pool.on('connect', (client) => {
      const labelPrefix = config.monitoringConfig?.labelPrefix || 'pg_pool';
      client.on('error', (err) => {
        console.error(`${labelPrefix}_client_error`, err);
      });
    });
  }

  // Configure replica support
  if (config.replicaConfig?.autoFailover) {
    pool.on('error', async (err) => {
      if (err.message.includes('connection terminated')) {
        try {
          // Attempt to connect to replica
          const replicaHost = config.replicaConfig.hosts[0];
          pool.options.host = replicaHost;
          await pool.connect();
          console.log(`Failover successful to replica: ${replicaHost}`);
        } catch (failoverErr) {
          console.error('Failover failed:', failoverErr);
        }
      }
    });
  }

  return pool;
}

export {
  DatabaseConfig,
  SSLConfig,
  ReplicaConfig,
  MonitoringConfig,
  createDatabasePool,
  validateDatabaseConfig,
  DEFAULT_POOL_CONFIG,
  DEFAULT_SSL_CONFIG
};