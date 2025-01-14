"""
Planning Service Package Initialization
Version: 1.0.0

Exports core components and initializes required modules for the satellite data collection
planning service. Provides centralized access to key service functionality.
"""

from importlib.metadata import version  # python3.11+

# Import core components
from .app import app  # FastAPI application instance v0.95+
from .models.asset import Asset, VALID_ASSET_TYPES  # Asset model and validation constants

# Package version
__version__ = version('planning-service')

# Export core components
__all__ = [
    'app',           # Main FastAPI application instance
    'Asset',         # Asset model for collection planning
    'VALID_ASSET_TYPES',  # Valid asset type constants
    '__version__'    # Package version information
]

# Initialize logging configuration
import logging
logging.getLogger(__name__).addHandler(logging.NullHandler())

# Validate environment on import
from .config.earthn_config import EarthnConfig
try:
    EarthnConfig(validate_on_startup=True)
except Exception as e:
    logging.error(f"Environment validation failed: {str(e)}")
    raise

# Initialize Redis connection pool
from .config.redis_config import RedisConfig
try:
    redis_config = RedisConfig()
    redis_config.get_client()
except Exception as e:
    logging.error(f"Redis initialization failed: {str(e)}")
    raise

# Register cleanup handlers
import atexit

def cleanup():
    """Cleanup handler for graceful shutdown"""
    try:
        redis_config.close_client()
        logging.info("Cleanup completed successfully")
    except Exception as e:
        logging.error(f"Cleanup error: {str(e)}")

atexit.register(cleanup)