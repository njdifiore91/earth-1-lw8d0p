from datetime import datetime
from typing import Dict, List, Any, Optional
from uuid import UUID
from pydantic import BaseModel, Field, validator, root_validator
from pydantic.types import PositiveFloat, confloat

# Import model constants for validation
from ..models.collection_plan import PLAN_STATUS_TYPES, MIN_WINDOW_DURATION
from ..models.asset import VALID_ASSET_TYPES, MIN_SIZE, MAX_SIZE
from ..models.requirement import VALID_PARAMETER_TYPES, PARAMETER_UNITS

class CollectionWindowSchema(BaseModel):
    """
    Pydantic schema for validating collection window data with enhanced validation rules.
    """
    window_id: UUID = Field(..., description="Unique identifier for the collection window")
    start_time: datetime = Field(..., description="Window start time in UTC")
    end_time: datetime = Field(..., description="Window end time in UTC")
    confidence_score: confloat(ge=0.0, le=1.0) = Field(
        ..., 
        description="Confidence score between 0 and 1"
    )
    parameters: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional window parameters"
    )
    status: str = Field(
        default="DRAFT",
        description="Current window status"
    )

    @root_validator(pre=True)
    def validate_window(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """
        Enhanced validator for collection window parameters with comprehensive checks.
        """
        if not values:
            raise ValueError("Window data cannot be empty")

        # Validate time window
        start_time = values.get('start_time')
        end_time = values.get('end_time')
        if start_time and end_time:
            if start_time >= end_time:
                raise ValueError("Start time must be before end time")
            
            duration = (end_time - start_time).total_seconds()
            if duration < MIN_WINDOW_DURATION:
                raise ValueError(
                    f"Collection window duration must be at least {MIN_WINDOW_DURATION} seconds"
                )

        # Validate status
        status = values.get('status', 'DRAFT')
        if status not in PLAN_STATUS_TYPES:
            raise ValueError(f"Invalid status: {status}. Must be one of {PLAN_STATUS_TYPES}")

        # Validate parameters structure
        parameters = values.get('parameters', {})
        if not isinstance(parameters, dict):
            raise ValueError("Parameters must be a dictionary")

        return values

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }

class AssetSchema(BaseModel):
    """
    Pydantic schema for validating asset data with enhanced type checking.
    """
    id: UUID = Field(..., description="Unique identifier for the asset")
    name: str = Field(..., min_length=1, max_length=100)
    type: str = Field(..., description="Asset type identifier")
    min_size: PositiveFloat = Field(..., description="Minimum detectable size")
    detection_limit: PositiveFloat = Field(..., description="Detection limit threshold")
    properties: Dict[str, Any] = Field(
        default_factory=dict,
        description="Asset properties"
    )
    capabilities: List[str] = Field(
        default_factory=list,
        description="Asset capabilities"
    )
    confidence_thresholds: Dict[str, float] = Field(
        default_factory=dict,
        description="Confidence thresholds per capability"
    )

    @root_validator(pre=True)
    def validate_asset(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """
        Enhanced validator for asset data with comprehensive type checking.
        """
        if not values:
            raise ValueError("Asset data cannot be empty")

        # Validate asset type
        asset_type = values.get('type')
        if asset_type not in VALID_ASSET_TYPES:
            raise ValueError(
                f"Invalid asset type: {asset_type}. Must be one of {VALID_ASSET_TYPES}"
            )

        # Validate size constraints
        min_size = values.get('min_size')
        if min_size is not None and not MIN_SIZE <= min_size <= MAX_SIZE:
            raise ValueError(
                f"Invalid minimum size: {min_size}. Must be between {MIN_SIZE} and {MAX_SIZE}"
            )

        # Validate properties
        properties = values.get('properties', {})
        required_props = {'resolution', 'spectral_bands', 'revisit_time'}
        missing_props = required_props - set(properties.keys())
        if missing_props:
            raise ValueError(f"Missing required properties: {missing_props}")

        # Validate confidence thresholds
        thresholds = values.get('confidence_thresholds', {})
        if not all(0.0 <= v <= 1.0 for v in thresholds.values()):
            raise ValueError("Confidence thresholds must be between 0 and 1")

        return values

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }
        schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "name": "Environmental Sensor",
                "type": "ENVIRONMENTAL_MONITORING",
                "min_size": 1.0,
                "detection_limit": 0.5,
                "properties": {
                    "resolution": 0.5,
                    "spectral_bands": ["RGB", "NIR"],
                    "revisit_time": 24
                },
                "capabilities": ["change_detection", "classification"],
                "confidence_thresholds": {
                    "change_detection": 0.85,
                    "classification": 0.90
                }
            }
        }