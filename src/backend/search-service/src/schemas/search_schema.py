"""
Pydantic schema definitions for validating and serializing search requests.
Implements comprehensive validation for locations, assets, and requirements with enhanced error handling.

Dependencies:
pydantic==2.0.0+
"""

from datetime import datetime
from typing import List, Dict, Optional, Tuple
from uuid import UUID
from pydantic import BaseModel, Field, validator, root_validator
from pydantic.dataclasses import dataclass
import logging

from ..models.search import (
    SEARCH_STATUS_TYPES,
    ASSET_TYPES,
    MAX_SEARCH_DURATION_DAYS,
    MAX_ASSETS_PER_SEARCH
)
from .location_schema import LocationBase

# Constants for validation
MIN_REQUIREMENT_VALUE = 0.0
MAX_METADATA_SIZE = 1024  # bytes
SUPPORTED_UNITS = ['meters', 'degrees', 'seconds']
MAX_REQUIREMENTS_PER_ASSET = 10

# Configure logging
logger = logging.getLogger(__name__)

@dataclass
class RequirementSchema(BaseModel):
    """Enhanced Pydantic schema for validating search requirements."""
    
    parameter: str = Field(
        ...,
        description="Requirement parameter name",
        min_length=1,
        max_length=64,
        regex="^[a-zA-Z0-9_]+$"
    )
    value: float = Field(
        ...,
        description="Requirement value",
        ge=MIN_REQUIREMENT_VALUE
    )
    unit: str = Field(
        ...,
        description="Measurement unit",
        regex="^[a-zA-Z]+$"
    )

    @validator('unit')
    def validate_unit(cls, v):
        """Validates measurement unit against supported units."""
        if v not in SUPPORTED_UNITS:
            raise ValueError(f"Unsupported unit. Must be one of: {SUPPORTED_UNITS}")
        return v

    def validate(self) -> Tuple[bool, Dict]:
        """Performs comprehensive requirement validation."""
        try:
            errors = {}
            
            # Validate parameter format
            if not self.parameter.isalnum() and '_' not in self.parameter:
                errors['parameter'] = "Invalid parameter format"
            
            # Validate value range and precision
            if self.value < MIN_REQUIREMENT_VALUE:
                errors['value'] = f"Value must be >= {MIN_REQUIREMENT_VALUE}"
            
            # Validate unit
            if self.unit not in SUPPORTED_UNITS:
                errors['unit'] = f"Invalid unit. Must be one of: {SUPPORTED_UNITS}"
            
            return len(errors) == 0, errors
            
        except Exception as e:
            logger.error(f"Requirement validation failed: {str(e)}")
            return False, {"error": str(e)}

@dataclass
class AssetSchema(BaseModel):
    """Enhanced Pydantic schema for validating search assets."""
    
    type: str = Field(
        ...,
        description="Asset type",
        regex="^[a-zA-Z]+$"
    )
    properties: Dict = Field(
        default_factory=dict,
        description="Asset properties"
    )
    requirements: List[RequirementSchema] = Field(
        default_factory=list,
        description="Asset requirements",
        max_items=MAX_REQUIREMENTS_PER_ASSET
    )

    @validator('type')
    def validate_type(cls, v):
        """Validates asset type against allowed types."""
        if v not in ASSET_TYPES:
            raise ValueError(f"Invalid asset type. Must be one of: {ASSET_TYPES}")
        return v

    @validator('properties')
    def validate_properties(cls, v):
        """Validates asset properties size and structure."""
        if len(str(v).encode()) > MAX_METADATA_SIZE:
            raise ValueError(f"Properties size exceeds {MAX_METADATA_SIZE} bytes")
        return v

    def validate(self) -> Tuple[bool, Dict]:
        """Performs comprehensive asset validation."""
        try:
            errors = {}
            
            # Validate type
            if self.type not in ASSET_TYPES:
                errors['type'] = f"Invalid type. Must be one of: {ASSET_TYPES}"
            
            # Validate properties size
            if len(str(self.properties).encode()) > MAX_METADATA_SIZE:
                errors['properties'] = f"Properties size exceeds {MAX_METADATA_SIZE} bytes"
            
            # Validate requirements
            if len(self.requirements) > MAX_REQUIREMENTS_PER_ASSET:
                errors['requirements'] = f"Maximum {MAX_REQUIREMENTS_PER_ASSET} requirements allowed"
            
            # Validate individual requirements
            requirement_errors = []
            for req in self.requirements:
                is_valid, req_errors = req.validate()
                if not is_valid:
                    requirement_errors.append(req_errors)
            
            if requirement_errors:
                errors['requirements'] = requirement_errors
            
            return len(errors) == 0, errors
            
        except Exception as e:
            logger.error(f"Asset validation failed: {str(e)}")
            return False, {"error": str(e)}

@dataclass
class SearchSchema(BaseModel):
    """Enhanced Pydantic schema for validating complete search requests."""
    
    user_id: UUID = Field(
        ...,
        description="User identifier"
    )
    status: str = Field(
        default="draft",
        description="Search status"
    )
    parameters: Dict = Field(
        ...,
        description="Search parameters including temporal window"
    )
    locations: List[LocationBase] = Field(
        default_factory=list,
        description="Search locations"
    )
    assets: List[AssetSchema] = Field(
        default_factory=list,
        description="Search assets",
        max_items=MAX_ASSETS_PER_SEARCH
    )

    @validator('status')
    def validate_status(cls, v):
        """Validates search status against allowed states."""
        if v not in SEARCH_STATUS_TYPES:
            raise ValueError(f"Invalid status. Must be one of: {SEARCH_STATUS_TYPES}")
        return v

    @validator('parameters')
    def validate_temporal_window(cls, v):
        """Validates search temporal window against constraints."""
        try:
            temporal = v.get('temporal_window', {})
            if not temporal or not all(k in temporal for k in ['start', 'end']):
                raise ValueError("Missing temporal window parameters")
            
            start = datetime.fromisoformat(temporal['start'])
            end = datetime.fromisoformat(temporal['end'])
            
            # Validate start time is not in past
            if start < datetime.utcnow():
                raise ValueError("Start time cannot be in the past")
            
            # Validate end time is after start
            if end <= start:
                raise ValueError("End time must be after start time")
            
            # Validate duration
            duration_days = (end - start).days
            if duration_days > MAX_SEARCH_DURATION_DAYS:
                raise ValueError(f"Search duration exceeds {MAX_SEARCH_DURATION_DAYS} days")
            
            return v
            
        except ValueError as e:
            raise ValueError(f"Temporal window validation failed: {str(e)}")

    def validate(self) -> Tuple[bool, Dict]:
        """Performs comprehensive search validation."""
        try:
            errors = {}
            
            # Validate temporal window
            try:
                self.validate_temporal_window(self.parameters)
            except ValueError as e:
                errors['parameters'] = str(e)
            
            # Validate locations
            location_errors = []
            for loc in self.locations:
                if not loc.validate():
                    location_errors.append(f"Invalid location: {loc}")
            if location_errors:
                errors['locations'] = location_errors
            
            # Validate assets
            if len(self.assets) > MAX_ASSETS_PER_SEARCH:
                errors['assets'] = f"Maximum {MAX_ASSETS_PER_SEARCH} assets allowed"
            
            asset_errors = []
            for asset in self.assets:
                is_valid, asset_error = asset.validate()
                if not is_valid:
                    asset_errors.append(asset_error)
            if asset_errors:
                errors['assets'] = asset_errors
            
            return len(errors) == 0, errors
            
        except Exception as e:
            logger.error(f"Search validation failed: {str(e)}")
            return False, {"error": str(e)}

    def to_model(self) -> Tuple[Dict, List[str]]:
        """Converts schema to Search model format with validation."""
        warnings = []
        
        try:
            # Convert locations
            locations = []
            for loc in self.locations:
                locations.append(loc.to_model())
            
            # Convert assets with requirements
            assets = []
            for asset in self.assets:
                asset_dict = {
                    "type": asset.type,
                    "properties": asset.properties,
                    "requirements": [
                        {
                            "parameter": req.parameter,
                            "value": req.value,
                            "unit": req.unit
                        }
                        for req in asset.requirements
                    ]
                }
                assets.append(asset_dict)
            
            return {
                "user_id": str(self.user_id),
                "status": self.status,
                "parameters": self.parameters,
                "locations": locations,
                "assets": assets
            }, warnings
            
        except Exception as e:
            logger.error(f"Model conversion failed: {str(e)}")
            raise ValueError(f"Failed to convert to model format: {str(e)}")