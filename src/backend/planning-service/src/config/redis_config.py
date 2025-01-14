"""
Redis configuration module for the planning service with comprehensive cluster support,
connection pooling, and failover capabilities.

Manages caching of collection plans, optimization results, and EARTH-n simulator responses.

External Dependencies:
- redis==4.5.0: Redis client with cluster support and connection pooling
- python-dotenv==1.0.0: Environment variable management
- typing==3.7.4: Type hints support
- logging==3.7.4: Logging configuration
"""

import os
import logging
from typing import Dict, Any, Optional
from redis import Redis, ConnectionPool, ConnectionError, RedisCluster
from redis.retry import Retry
from redis.backoff import ExponentialBackoff
from redis.exceptions import RedisError
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Redis Configuration Constants
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
REDIS_DB = int(os.getenv('REDIS_DB', '0'))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', None)
REDIS_TLS = os.getenv('REDIS_TLS', 'false').lower() == 'true'
REDIS_KEY_PREFIX = 'planning:'
REDIS_CLUSTER_MODE = os.getenv('REDIS_CLUSTER_MODE', 'false').lower() == 'true'
REDIS_MAX_CONNECTIONS = int(os.getenv('REDIS_MAX_CONNECTIONS', '10'))
REDIS_RETRY_ON_TIMEOUT = os.getenv('REDIS_RETRY_ON_TIMEOUT', 'true').lower() == 'true'
REDIS_SOCKET_TIMEOUT = float(os.getenv('REDIS_SOCKET_TIMEOUT', '5.0'))
REDIS_RETRY_COUNT = int(os.getenv('REDIS_RETRY_COUNT', '3'))
REDIS_HEALTH_CHECK_INTERVAL = int(os.getenv('REDIS_HEALTH_CHECK_INTERVAL', '30'))

def validate_redis_config(config: Dict[str, Any]) -> bool:
    """
    Validates Redis configuration parameters including security and performance settings.
    
    Args:
        config: Dictionary containing Redis configuration parameters
        
    Returns:
        bool: Configuration validity status
    """
    try:
        # Validate port range
        if not 1 <= config.get('port', REDIS_PORT) <= 65535:
            logger.error("Invalid Redis port number")
            return False
            
        # Validate connection pool settings
        if config.get('max_connections', REDIS_MAX_CONNECTIONS) < 1:
            logger.error("Invalid maximum connections value")
            return False
            
        # Validate timeout settings
        if config.get('socket_timeout', REDIS_SOCKET_TIMEOUT) <= 0:
            logger.error("Invalid socket timeout value")
            return False
            
        # Validate retry settings
        if config.get('retry_count', REDIS_RETRY_COUNT) < 0:
            logger.error("Invalid retry count value")
            return False
            
        # Validate health check interval
        if config.get('health_check_interval', REDIS_HEALTH_CHECK_INTERVAL) < 0:
            logger.error("Invalid health check interval")
            return False
            
        return True
    except Exception as e:
        logger.error(f"Configuration validation error: {str(e)}")
        return False

def create_redis_client(config: Dict[str, Any]) -> Redis:
    """
    Creates and configures a Redis client instance with comprehensive support for
    cluster mode, connection pooling, and error handling.
    
    Args:
        config: Dictionary containing Redis configuration parameters
        
    Returns:
        Redis: Configured Redis client instance
        
    Raises:
        RedisError: If client creation fails
    """
    try:
        if not validate_redis_config(config):
            raise ValueError("Invalid Redis configuration")
            
        # Configure retry strategy
        retry_strategy = Retry(
            max_attempts=config.get('retry_count', REDIS_RETRY_COUNT),
            backoff=ExponentialBackoff(),
            retry_on_timeout=config.get('retry_on_timeout', REDIS_RETRY_ON_TIMEOUT)
        )
        
        # Configure connection pool
        pool_kwargs = {
            'max_connections': config.get('max_connections', REDIS_MAX_CONNECTIONS),
            'socket_timeout': config.get('socket_timeout', REDIS_SOCKET_TIMEOUT),
            'retry_on_timeout': config.get('retry_on_timeout', REDIS_RETRY_ON_TIMEOUT),
            'health_check_interval': config.get('health_check_interval', REDIS_HEALTH_CHECK_INTERVAL)
        }
        
        # Add TLS configuration if enabled
        if config.get('tls_enabled', REDIS_TLS):
            pool_kwargs.update({
                'ssl': True,
                'ssl_cert_reqs': 'required'
            })
            
        # Create connection pool
        connection_pool = ConnectionPool(
            host=config.get('host', REDIS_HOST),
            port=config.get('port', REDIS_PORT),
            db=config.get('db', REDIS_DB),
            password=config.get('password', REDIS_PASSWORD),
            **pool_kwargs
        )
        
        # Create Redis client based on cluster mode
        if config.get('cluster_mode', REDIS_CLUSTER_MODE):
            client = RedisCluster(
                connection_pool=connection_pool,
                retry=retry_strategy,
                decode_responses=True
            )
        else:
            client = Redis(
                connection_pool=connection_pool,
                retry=retry_strategy,
                decode_responses=True
            )
            
        # Test connection
        client.ping()
        logger.info("Redis client successfully created and connected")
        return client
        
    except ConnectionError as ce:
        logger.error(f"Redis connection error: {str(ce)}")
        raise
    except RedisError as re:
        logger.error(f"Redis client creation error: {str(re)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error creating Redis client: {str(e)}")
        raise

class RedisConfig:
    """
    Comprehensive configuration class for Redis settings with support for
    clustering, connection pooling, and monitoring.
    """
    
    def __init__(self):
        """Initialize Redis configuration with comprehensive environment variable validation."""
        self.host = REDIS_HOST
        self.port = REDIS_PORT
        self.db = REDIS_DB
        self.password = REDIS_PASSWORD
        self.tls_enabled = REDIS_TLS
        self.cluster_mode = REDIS_CLUSTER_MODE
        self.key_prefix = REDIS_KEY_PREFIX
        self.max_connections = REDIS_MAX_CONNECTIONS
        self.retry_on_timeout = REDIS_RETRY_ON_TIMEOUT
        self.socket_timeout = REDIS_SOCKET_TIMEOUT
        self.retry_count = REDIS_RETRY_COUNT
        self.health_check_interval = REDIS_HEALTH_CHECK_INTERVAL
        self._client: Optional[Redis] = None
        
    def get_client(self) -> Redis:
        """
        Returns configured Redis client instance with failover support.
        
        Returns:
            Redis: Redis client instance
        """
        if self._client is None:
            config = {
                'host': self.host,
                'port': self.port,
                'db': self.db,
                'password': self.password,
                'tls_enabled': self.tls_enabled,
                'cluster_mode': self.cluster_mode,
                'max_connections': self.max_connections,
                'retry_on_timeout': self.retry_on_timeout,
                'socket_timeout': self.socket_timeout,
                'retry_count': self.retry_count,
                'health_check_interval': self.health_check_interval
            }
            self._client = create_redis_client(config)
        return self._client
        
    def close_client(self) -> None:
        """Safely closes Redis client connection with cleanup."""
        if self._client is not None:
            try:
                self._client.close()
                logger.info("Redis client connection closed successfully")
            except RedisError as e:
                logger.error(f"Error closing Redis client: {str(e)}")
            finally:
                self._client = None