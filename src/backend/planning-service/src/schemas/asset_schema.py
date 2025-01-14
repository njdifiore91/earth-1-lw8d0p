"""
Pydantic schema for validating and serializing satellite data collection assets.
Implements comprehensive validation rules, type checking, and error handling.
"""

from datetime import datetime
from typing import Dict, List, Any
from uuid import UUID
import logging

from pydantic import BaseModel, validator, Field  # pydantic ^2.0.0

from ..models.asset import (
    VALID_ASSET_TYPES,
    MIN_DETECTION_LIMIT,
    MAX_DETECTION_LIMIT,
    MIN_SIZE,
    MAX_SIZE
)

# Schema version for compatibility tracking
SCHEMA_VERSION = '1.0.0'

# Configure logging
logger = logging.getLogger(__name__)

class AssetSchema(BaseModel):
    """
    Pydantic model for validating asset data with strict type checking and validation rules.
    Implements comprehensive error handling and schema versioning.
    """
    id: UUID = Field(description="Unique identifier for the asset")
    name: str = Field(min_length=1, max_length=255, description="Asset name")
    type: str = Field(description="Type of asset for collection planning")
    min_size: float = Field(description="Minimum detectable size in meters")
    detection_limit: float = Field(description="Minimum detection threshold")
    properties: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional asset properties"
    )
    capabilities: List[str] = Field(
        default_factory=list,
        description="List of asset capabilities"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    schema_version: str = Field(default=SCHEMA_VERSION)

    class Config:
        """Pydantic model configuration"""
        validate_assignment = True
        arbitrary_types_allowed = True
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }
        schema_extra = {
            "example": {
                "name": "Environmental Sensor",
                "type": "ENVIRONMENTAL_MONITORING",
                "min_size": 1.0,
                "detection_limit": 0.5,
                "properties": {
                    "resolution": 0.3,
                    "spectral_bands": ["RGB", "NIR"],
                    "revisit_time": 3
                }
            }
        }

    @validator('type')
    def validate_type(cls, value: str) -> str:
        """
        Validates asset type against allowed values with detailed error messages.
        """
        if value not in VALID_ASSET_TYPES:
            logger.error(f"Invalid asset type attempted: {value}")
            raise ValueError(
                f"Invalid asset type: {value}. "
                f"Must be one of: {', '.join(VALID_ASSET_TYPES)}"
            )
        logger.debug(f"Asset type validated: {value}")
        return value

    @validator('detection_limit')
    def validate_detection_limit(cls, value: float) -> float:
        """
        Validates detection limit range with comprehensive error handling.
        """
        if not MIN_DETECTION_LIMIT <= value <= MAX_DETECTION_LIMIT:
            logger.error(f"Invalid detection limit attempted: {value}")
            raise ValueError(
                f"Detection limit must be between "
                f"{MIN_DETECTION_LIMIT} and {MAX_DETECTION_LIMIT}"
            )
        logger.debug(f"Detection limit validated: {value}")
        return value

    @validator('min_size')
    def validate_min_size(cls, value: float) -> float:
        """
        Validates minimum size range with error context.
        """
        if not MIN_SIZE <= value <= MAX_SIZE:
            logger.error(f"Invalid minimum size attempted: {value}")
            raise ValueError(
                f"Minimum size must be between {MIN_SIZE} and {MAX_SIZE} meters"
            )
        logger.debug(f"Minimum size validated: {value}")
        return value

    @validator('schema_version')
    def validate_schema_version(cls, value: str) -> str:
        """
        Validates schema version compatibility.
        """
        if value != SCHEMA_VERSION:
            logger.warning(f"Schema version mismatch. Got {value}, expected {SCHEMA_VERSION}")
            raise ValueError(
                f"Schema version mismatch. Got {value}, expected {SCHEMA_VERSION}"
            )
        logger.debug(f"Schema version validated: {value}")
        return value

    @validator('properties')
    def validate_properties(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates required properties and their types.
        """
        required_props = {'resolution', 'spectral_bands', 'revisit_time'}
        missing_props = required_props - set(value.keys())
        
        if missing_props:
            logger.error(f"Missing required properties: {missing_props}")
            raise ValueError(f"Missing required properties: {missing_props}")

        # Validate property types
        if not isinstance(value.get('resolution'), (int, float)):
            raise ValueError("Resolution must be a numeric value")
        
        if not isinstance(value.get('spectral_bands'), list):
            raise ValueError("Spectral bands must be a list")
            
        if not isinstance(value.get('revisit_time'), int):
            raise ValueError("Revisit time must be an integer")

        logger.debug("Properties validated successfully")
        return value