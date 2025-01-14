"""
Matter satellite data product matching platform search service initialization.
Provides core search functionality exports and component initialization.

Dependencies:
fastapi==0.95.0+
"""

import logging
from typing import List

from .app import app
from .models.search import Search, SEARCH_STATUS_TYPES, ASSET_TYPES

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Package metadata following SemVer 2.0.0
__version__ = '1.0.0'
__author__ = 'Matter Satellite Data Platform Team'

# Public exports
__all__: List[str] = [
    'app',
    'Search',
    'SEARCH_STATUS_TYPES',
    'ASSET_TYPES'
]

def _validate_initialization() -> bool:
    """
    Internal function to validate proper initialization of all critical components.
    
    Returns:
        bool: True if all components initialized successfully
    """
    try:
        # Verify FastAPI app instance
        if not app:
            logger.error("FastAPI app instance not initialized")
            return False
            
        # Verify Search model availability
        if not Search:
            logger.error("Search model not initialized")
            return False
            
        # Verify constant definitions
        if not SEARCH_STATUS_TYPES or not ASSET_TYPES:
            logger.error("Search constants not defined")
            return False
            
        # Log successful initialization
        logger.info(
            "Search service initialized successfully",
            extra={
                "version": __version__,
                "components": {
                    "app": bool(app),
                    "search_model": bool(Search),
                    "constants": bool(SEARCH_STATUS_TYPES and ASSET_TYPES)
                }
            }
        )
        return True
        
    except Exception as e:
        logger.error(f"Initialization validation failed: {str(e)}")
        return False

# Validate initialization on module load
if not _validate_initialization():
    raise RuntimeError("Search service initialization failed")