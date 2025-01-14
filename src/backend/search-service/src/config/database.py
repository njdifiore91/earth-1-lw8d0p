"""
Database configuration module for the search service.
Implements secure PostgreSQL connections with PostGIS support, connection pooling,
health monitoring, and comprehensive security validation.

Dependencies:
sqlalchemy==2.0.0+
geoalchemy2==0.13.0+
python-dotenv==1.0.0+
psycopg2-binary==2.9.0+
tenacity==8.0.0+
cryptography==37.0.0+
"""

import os
import ssl
from typing import Dict, Optional
from urllib.parse import quote_plus

from cryptography import x509
from cryptography.hazmat.backends import default_backend
from dotenv import load_dotenv
from geoalchemy2 import Geometry
from sqlalchemy import create_engine as sa_create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import QueuePool
from tenacity import retry, stop_after_attempt, wait_exponential

# Load environment variables
load_dotenv()

# Database connection settings
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = int(os.getenv('DB_PORT', '5432'))
DB_NAME = os.getenv('DB_NAME', 'matter_search')
DB_USER = os.getenv('DB_USER', 'matter_user')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')
DB_SSL_MODE = os.getenv('DB_SSL_MODE', 'verify-full')
DB_SSL_CERT = os.getenv('DB_SSL_CERT', '/etc/ssl/certs/postgresql.crt')

# Connection pool settings
POOL_SIZE = int(os.getenv('POOL_SIZE', '20'))
POOL_MAX_OVERFLOW = int(os.getenv('POOL_MAX_OVERFLOW', '10'))
POOL_TIMEOUT = int(os.getenv('POOL_TIMEOUT', '30'))
POOL_RECYCLE = int(os.getenv('POOL_RECYCLE', '1800'))
POOL_PRE_PING = os.getenv('POOL_PRE_PING', 'true').lower() == 'true'

# Retry settings
RETRY_ATTEMPTS = int(os.getenv('RETRY_ATTEMPTS', '3'))
RETRY_DELAY = int(os.getenv('RETRY_DELAY', '1'))

class DatabaseConfig:
    """Advanced database configuration manager with monitoring and health checks."""
    
    def __init__(self, config_override: Optional[Dict] = None):
        """Initialize database configuration with enhanced security and monitoring.
        
        Args:
            config_override: Optional configuration parameter overrides
        """
        self._config = config_override or {}
        self._engine = None
        self._ssl_context = None
        self._setup_ssl_context()
        self._monitoring_enabled = True
        self._health_check_interval = 60
        
    def _setup_ssl_context(self) -> None:
        """Configure SSL context with certificate verification."""
        if DB_SSL_MODE != 'disable':
            self._ssl_context = ssl.create_default_context(
                purpose=ssl.Purpose.SERVER_AUTH,
                cafile=DB_SSL_CERT
            )
            if DB_SSL_MODE == 'verify-full':
                with open(DB_SSL_CERT, 'rb') as cert_file:
                    cert_data = cert_file.read()
                    cert = x509.load_pem_x509_certificate(cert_data, default_backend())
                    self._ssl_context.verify_mode = ssl.CERT_REQUIRED
                    
    def get_engine(self) -> Engine:
        """Returns configured database engine with health checks.
        
        Returns:
            SQLAlchemy engine instance with PostGIS support
        """
        if not self._engine:
            self._engine = create_engine(self._config)
            if not verify_postgis(self._engine):
                raise RuntimeError("PostGIS verification failed")
        return self._engine
    
    def dispose_engine(self) -> None:
        """Safely disposes database engine with connection cleanup."""
        if self._engine:
            self._monitoring_enabled = False
            self._engine.dispose()
            self._engine = None
            
    def check_health(self) -> Dict:
        """Performs comprehensive database health check.
        
        Returns:
            Dict containing health check results and metrics
        """
        if not self._engine:
            return {"status": "not_initialized"}
            
        try:
            with self._engine.connect() as conn:
                # Basic connectivity check
                conn.execute(text("SELECT 1"))
                
                # PostGIS functionality check
                conn.execute(text("SELECT PostGIS_Version()"))
                
                # Pool statistics
                pool = self._engine.pool
                stats = {
                    "status": "healthy",
                    "pool_size": pool.size(),
                    "checkedin": pool.checkedin(),
                    "overflow": pool.overflow(),
                    "checkedout": pool.checkedout()
                }
                return stats
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e)
            }

@retry(stop=stop_after_attempt(RETRY_ATTEMPTS), 
       wait=wait_exponential(multiplier=RETRY_DELAY))
def create_engine(config_override: Optional[Dict] = None) -> Engine:
    """Creates and configures SQLAlchemy engine with PostGIS support and enhanced security.
    
    Args:
        config_override: Optional configuration override parameters
        
    Returns:
        Configured SQLAlchemy engine instance with PostGIS support
    """
    url = get_db_url()
    
    engine_args = {
        "pool_size": POOL_SIZE,
        "max_overflow": POOL_MAX_OVERFLOW,
        "pool_timeout": POOL_TIMEOUT,
        "pool_recycle": POOL_RECYCLE,
        "pool_pre_ping": POOL_PRE_PING,
        "poolclass": QueuePool,
        "connect_args": {
            "sslmode": DB_SSL_MODE,
            "sslcert": DB_SSL_CERT if DB_SSL_MODE != 'disable' else None,
        }
    }
    
    if config_override:
        engine_args.update(config_override)
        
    engine = sa_create_engine(url, **engine_args)
    
    # Verify PostGIS configuration
    if not verify_postgis(engine):
        raise RuntimeError("PostGIS verification failed")
        
    return engine

def get_db_url() -> str:
    """Constructs secure database URL with credentials and SSL configuration.
    
    Returns:
        Secure database connection URL with SSL parameters
    """
    if not all([DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD]):
        raise ValueError("Missing required database configuration")
        
    return (
        f"postgresql://{quote_plus(DB_USER)}:{quote_plus(DB_PASSWORD)}"
        f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )

@retry(stop=stop_after_attempt(3), wait=wait_exponential())
def verify_postgis(engine: Engine) -> bool:
    """Comprehensive verification of PostGIS installation and configuration.
    
    Args:
        engine: SQLAlchemy engine instance
        
    Returns:
        True if PostGIS is properly configured and operational
    """
    try:
        with engine.connect() as conn:
            # Verify PostGIS extension
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            
            # Check PostGIS version
            version = conn.execute(text("SELECT PostGIS_Version()")).scalar()
            if not version:
                return False
                
            # Validate spatial reference systems
            srid_check = conn.execute(text(
                "SELECT COUNT(*) FROM spatial_ref_sys WHERE srid = 4326"
            )).scalar()
            if not srid_check:
                return False
                
            # Test spatial functionality
            test_query = text("""
                SELECT ST_AsText(
                    ST_Transform(
                        ST_SetSRID(ST_MakePoint(0, 0), 4326),
                        4326
                    )
                )
            """)
            conn.execute(test_query)
            
            return True
    except Exception:
        return False