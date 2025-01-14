"""
Redis configuration module for the search service with advanced features including
cluster support, connection pooling, health monitoring, and security.

External Dependencies:
- redis==4.5.0: Redis client with cluster support
- python-dotenv==1.0.0: Environment variable management
- typing==3.7.4: Type hints support
"""

import os
import ssl
import logging
from typing import Dict, Any, Optional, Union
from redis import Redis, ConnectionPool, ConnectionError
from redis.cluster import RedisCluster
from redis.retry import Retry
from redis.backoff import ExponentialBackoff
from redis.exceptions import RedisError
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Redis configuration constants
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
REDIS_DB = int(os.getenv('REDIS_DB', '0'))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', None)
REDIS_TLS = os.getenv('REDIS_TLS', 'false').lower() == 'true'
REDIS_KEY_PREFIX = 'search:'
REDIS_CLUSTER_MODE = os.getenv('REDIS_CLUSTER_MODE', 'false').lower() == 'true'
REDIS_MAX_CONNECTIONS = int(os.getenv('REDIS_MAX_CONNECTIONS', '100'))
REDIS_TIMEOUT = float(os.getenv('REDIS_TIMEOUT', '5.0'))
REDIS_RETRY_INTERVAL = float(os.getenv('REDIS_RETRY_INTERVAL', '1.0'))
REDIS_MAX_RETRIES = int(os.getenv('REDIS_MAX_RETRIES', '3'))

class RedisConfig:
    """Enhanced Redis configuration class with advanced connection management and monitoring."""
    
    def __init__(self) -> None:
        """Initialize Redis configuration with comprehensive parameter validation."""
        self.host: str = REDIS_HOST
        self.port: int = REDIS_PORT
        self.db: int = REDIS_DB
        self.password: Optional[str] = REDIS_PASSWORD
        self.tls_enabled: bool = REDIS_TLS
        self.cluster_mode: bool = REDIS_CLUSTER_MODE
        self.key_prefix: str = REDIS_KEY_PREFIX
        self.max_connections: int = REDIS_MAX_CONNECTIONS
        self.connection_timeout: float = REDIS_TIMEOUT
        self.retry_interval: float = REDIS_RETRY_INTERVAL
        self.max_retries: int = REDIS_MAX_RETRIES
        self.health_check_interval: int = 30
        
        self._client: Optional[Union[Redis, RedisCluster]] = None
        self._connection_pool: Optional[ConnectionPool] = None
        self._circuit_breaker_tripped: bool = False
        self._validate_config()

    def _validate_config(self) -> None:
        """Validate Redis configuration parameters."""
        if not 1024 <= self.port <= 65535:
            raise ValueError("Port number must be between 1024 and 65535")
        
        if self.password and len(self.password) < 8:
            raise ValueError("Redis password must be at least 8 characters long")
        
        if self.max_connections < 1:
            raise ValueError("Maximum connections must be greater than 0")
        
        if self.connection_timeout <= 0:
            raise ValueError("Connection timeout must be greater than 0")

    def _create_ssl_context(self) -> Optional[ssl.SSLContext]:
        """Create SSL context for TLS connections."""
        if self.tls_enabled:
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = True
            ssl_context.verify_mode = ssl.CERT_REQUIRED
            return ssl_context
        return None

    def _create_retry_strategy(self) -> Retry:
        """Create retry strategy with exponential backoff."""
        return Retry(
            max_attempts=self.max_retries,
            backoff=ExponentialBackoff(cap=10, base=2),
            retry_on_timeout=True
        )

    def get_client(self) -> Union[Redis, RedisCluster]:
        """Get configured Redis client instance with connection pool and monitoring."""
        if self._circuit_breaker_tripped:
            logger.warning("Circuit breaker is tripped. Attempting reset...")
            self._circuit_breaker_tripped = False

        if not self._client:
            try:
                connection_kwargs = {
                    'host': self.host,
                    'port': self.port,
                    'db': self.db,
                    'password': self.password,
                    'socket_timeout': self.connection_timeout,
                    'socket_connect_timeout': self.connection_timeout,
                    'retry': self._create_retry_strategy(),
                    'ssl': self._create_ssl_context(),
                    'health_check_interval': self.health_check_interval
                }

                if not self._connection_pool:
                    self._connection_pool = ConnectionPool(
                        max_connections=self.max_connections,
                        **connection_kwargs
                    )

                if self.cluster_mode:
                    self._client = RedisCluster(
                        connection_pool=self._connection_pool,
                        decode_responses=True
                    )
                else:
                    self._client = Redis(
                        connection_pool=self._connection_pool,
                        decode_responses=True
                    )

                # Test connection
                self._client.ping()
                logger.info("Successfully connected to Redis")

            except RedisError as e:
                self._circuit_breaker_tripped = True
                logger.error(f"Failed to connect to Redis: {str(e)}")
                raise

        return self._client

    def close_client(self) -> None:
        """Safely close Redis client connection with proper cleanup."""
        try:
            if self._client:
                self._client.close()
                self._client = None
            if self._connection_pool:
                self._connection_pool.disconnect()
                self._connection_pool = None
            logger.info("Redis connection closed successfully")
        except RedisError as e:
            logger.error(f"Error closing Redis connection: {str(e)}")

def validate_redis_config(config: Dict[str, Any]) -> bool:
    """Validate Redis configuration parameters with enhanced security checks."""
    try:
        required_params = ['host', 'port', 'db']
        if not all(param in config for param in required_params):
            return False

        # Validate port range
        if not 1024 <= int(config['port']) <= 65535:
            return False

        # Validate password if provided
        if config.get('password') and len(config['password']) < 8:
            return False

        # Validate connection pool settings
        if config.get('max_connections', 100) < 1:
            return False

        # Validate timeout and retry settings
        if config.get('connection_timeout', 5.0) <= 0:
            return False

        return True

    except (ValueError, TypeError):
        return False

def create_redis_client(config: Dict[str, Any]) -> Union[Redis, RedisCluster]:
    """Create and configure Redis client instance with advanced features."""
    if not validate_redis_config(config):
        raise ValueError("Invalid Redis configuration")

    redis_config = RedisConfig()
    for key, value in config.items():
        if hasattr(redis_config, key):
            setattr(redis_config, key, value)

    return redis_config.get_client()