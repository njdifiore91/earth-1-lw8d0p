"""
Location schema definitions for validating and serializing location data.
Implements comprehensive geometry validation, spatial constraints, and error handling.

Dependencies:
pydantic==2.0.0+
geojson==3.0.0+
"""

from typing import Dict, Optional, List, Union
from pydantic import BaseModel, Field, validator, root_validator
from pydantic.dataclasses import dataclass
import geojson
import logging

from ..models.location import MAX_AREA_SIZE, VALID_LOCATION_TYPES
from ..utils.spatial_utils import (
    transform_coordinates,
    calculate_area,
    validate_bounds,
    COORDINATE_PRECISION,
    DEFAULT_SRID
)

# Configure logging
logger = logging.getLogger(__name__)

class ValidationError(Exception):
    """Custom validation error with detailed context."""
    def __init__(self, message: str, details: Optional[Dict] = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)

@validate_input
def validate_geometry_data(geometry: Dict) -> bool:
    """
    Validates geometry data against spatial constraints with enhanced error handling.
    
    Args:
        geometry: GeoJSON geometry dictionary
        
    Returns:
        bool: True if geometry is valid
        
    Raises:
        ValidationError: If validation fails with detailed error information
    """
    try:
        # Validate GeoJSON format
        if not geojson.is_valid(geometry):
            raise ValidationError(
                "Invalid GeoJSON format",
                {"validation_errors": geojson.validation.check(geometry)}
            )
        
        # Validate geometry type
        geom_type = geometry.get('type')
        if geom_type not in VALID_LOCATION_TYPES:
            raise ValidationError(
                f"Invalid geometry type: {geom_type}",
                {"valid_types": VALID_LOCATION_TYPES}
            )
        
        # Validate coordinate bounds
        if not validate_bounds(geometry):
            raise ValidationError(
                "Coordinates out of valid bounds",
                {"bounds_validation": False}
            )
        
        # Validate area constraints
        area = calculate_area(geometry)
        if area > MAX_AREA_SIZE:
            raise ValidationError(
                f"Area exceeds maximum size of {MAX_AREA_SIZE} km²",
                {"area": area, "max_size": MAX_AREA_SIZE}
            )
        
        return True
        
    except Exception as e:
        logger.error(f"Geometry validation failed: {str(e)}")
        raise ValidationError(str(e))

@dataclass
class LocationBase(BaseModel):
    """
    Enhanced Pydantic schema for location data validation with comprehensive validation rules.
    """
    type: str = Field(
        ...,
        description="Location type (polygon, point, multipolygon)",
        example="polygon"
    )
    geometry: Dict = Field(
        ...,
        description="GeoJSON geometry object",
        example={
            "type": "Polygon",
            "coordinates": [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
        }
    )
    metadata: Optional[Dict] = Field(
        default=None,
        description="Additional location metadata",
        example={"source": "user_input", "accuracy": "high"}
    )
    validation_rules: Optional[Dict] = Field(
        default=None,
        description="Custom validation rules configuration"
    )
    coordinate_system: Optional[str] = Field(
        default=str(DEFAULT_SRID),
        description="Coordinate reference system EPSG code"
    )

    class Config:
        """Pydantic model configuration."""
        arbitrary_types_allowed = True
        json_encoders = {
            geojson.geometry.Geometry: lambda x: x.__geo_interface__
        }
        schema_extra = {
            "example": {
                "type": "polygon",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
                },
                "metadata": {"source": "user_input"},
                "coordinate_system": "4326"
            }
        }

    @validator('type')
    def validate_type(cls, v):
        """Validates location type against allowed types."""
        if v not in VALID_LOCATION_TYPES:
            raise ValidationError(
                f"Invalid location type: {v}",
                {"valid_types": VALID_LOCATION_TYPES}
            )
        return v

    @validator('geometry')
    def validate_geometry(cls, v):
        """Validates geometry with comprehensive checks."""
        validate_geometry_data(v)
        return v

    @root_validator
    def validate_all(cls, values):
        """Performs cross-field validation and applies custom rules."""
        try:
            # Transform coordinates if custom CRS specified
            if values.get('coordinate_system') and values.get('coordinate_system') != str(DEFAULT_SRID):
                values['geometry'] = transform_coordinates(
                    values['geometry'],
                    int(values['coordinate_system']),
                    DEFAULT_SRID
                )
            
            # Apply custom validation rules if specified
            if values.get('validation_rules'):
                # Custom validation logic would go here
                pass
            
            return values
            
        except Exception as e:
            logger.error(f"Cross-field validation failed: {str(e)}")
            raise ValidationError(str(e))

    def validate(self) -> bool:
        """
        Validates complete location data with enhanced error handling.
        
        Returns:
            bool: True if all validations pass
            
        Raises:
            ValidationError: If validation fails
        """
        try:
            # Validate type
            self.validate_type(self.type)
            
            # Validate geometry
            self.validate_geometry(self.geometry)
            
            # Perform cross-field validation
            self.validate_all(self.dict())
            
            return True
            
        except Exception as e:
            logger.error(f"Location validation failed: {str(e)}")
            raise ValidationError(str(e))

    def to_model(self) -> Dict:
        """
        Converts schema to Location model instance with enhanced data handling.
        
        Returns:
            Dict: Model-compatible dictionary with validated data
        """
        try:
            # Transform coordinates to target CRS if needed
            geometry = self.geometry
            if self.coordinate_system and self.coordinate_system != str(DEFAULT_SRID):
                geometry = transform_coordinates(
                    self.geometry,
                    int(self.coordinate_system),
                    DEFAULT_SRID
                )
            
            return {
                "type": self.type,
                "geometry": geometry,
                "metadata": self.metadata or {},
                "coordinate_system": DEFAULT_SRID
            }
            
        except Exception as e:
            logger.error(f"Model conversion failed: {str(e)}")
            raise ValidationError(str(e))