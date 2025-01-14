from dataclasses import dataclass, field  # python3.11+
from typing import Dict, List, Any, Optional, Set  # python3.11+
from uuid import uuid4  # python3.11+
from datetime import datetime, timezone  # python3.11+
from enum import Enum
from typing_extensions import TypedDict  # python3.11+

# Constants for validation
VALID_ASSET_TYPES = ['ENVIRONMENTAL_MONITORING', 'INFRASTRUCTURE', 'AGRICULTURE', 'CUSTOM']
MIN_DETECTION_LIMIT = 0.1
MAX_DETECTION_LIMIT = 100.0
MIN_SIZE = 0.5
MAX_SIZE = 1000.0
REQUIRED_PROPERTIES = {'resolution', 'spectral_bands', 'revisit_time'}
CURRENT_SCHEMA_VERSION = "1.0"

class ValidationError(Exception):
    """Custom exception for asset validation errors"""
    pass

class PropertyTypes(TypedDict):
    """Type definition for required asset properties"""
    resolution: float
    spectral_bands: List[str]
    revisit_time: int

@dataclass
class Asset:
    """
    Represents a satellite data collection asset with comprehensive validation 
    and serialization capabilities.
    """
    name: str
    type: str
    min_size: float
    detection_limit: float
    properties: Dict[str, Any] = field(default_factory=dict)
    capabilities: List[str] = field(default_factory=list)
    id: str = field(default_factory=lambda: str(uuid4()))
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    schema_version: str = field(default=CURRENT_SCHEMA_VERSION)

    def __post_init__(self):
        """Validate instance after initialization"""
        self.validate()

    def validate(self) -> bool:
        """
        Performs comprehensive validation of all asset parameters.
        Raises ValidationError if validation fails.
        """
        # Validate asset type
        if self.type not in VALID_ASSET_TYPES:
            raise ValidationError(f"Invalid asset type: {self.type}. Must be one of {VALID_ASSET_TYPES}")

        # Validate size constraints
        if not MIN_SIZE <= self.min_size <= MAX_SIZE:
            raise ValidationError(
                f"Invalid minimum size: {self.min_size}. Must be between {MIN_SIZE} and {MAX_SIZE}"
            )

        # Validate detection limit
        if not MIN_DETECTION_LIMIT <= self.detection_limit <= MAX_DETECTION_LIMIT:
            raise ValidationError(
                f"Invalid detection limit: {self.detection_limit}. Must be between "
                f"{MIN_DETECTION_LIMIT} and {MAX_DETECTION_LIMIT}"
            )

        # Validate required properties
        missing_props = REQUIRED_PROPERTIES - set(self.properties.keys())
        if missing_props:
            raise ValidationError(f"Missing required properties: {missing_props}")

        # Validate property types and ranges
        if not isinstance(self.properties.get('resolution'), (int, float)):
            raise ValidationError("Resolution must be a numeric value")
        
        if not isinstance(self.properties.get('spectral_bands'), list):
            raise ValidationError("Spectral bands must be a list")
            
        if not isinstance(self.properties.get('revisit_time'), int):
            raise ValidationError("Revisit time must be an integer")

        # Validate timestamps
        if not isinstance(self.created_at, datetime) or not isinstance(self.updated_at, datetime):
            raise ValidationError("Invalid timestamp format")

        # Validate schema version
        if self.schema_version != CURRENT_SCHEMA_VERSION:
            raise ValidationError(f"Invalid schema version. Expected {CURRENT_SCHEMA_VERSION}")

        return True

    def to_dict(self) -> Dict[str, Any]:
        """
        Converts asset instance to dictionary with proper type handling.
        """
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'min_size': self.min_size,
            'detection_limit': self.detection_limit,
            'properties': self.properties,
            'capabilities': self.capabilities,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'schema_version': self.schema_version
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Asset':
        """
        Creates asset instance from dictionary with validation.
        """
        required_fields = {'name', 'type', 'min_size', 'detection_limit'}
        missing_fields = required_fields - set(data.keys())
        if missing_fields:
            raise ValidationError(f"Missing required fields: {missing_fields}")

        # Parse timestamps if present
        if 'created_at' in data:
            data['created_at'] = datetime.fromisoformat(data['created_at'])
        if 'updated_at' in data:
            data['updated_at'] = datetime.fromisoformat(data['updated_at'])

        # Create new instance with validation
        instance = cls(
            name=data['name'],
            type=data['type'],
            min_size=float(data['min_size']),
            detection_limit=float(data['detection_limit']),
            properties=data.get('properties', {}),
            capabilities=data.get('capabilities', [])
        )

        # Set additional fields if present
        if 'id' in data:
            instance.id = data['id']
        if 'created_at' in data:
            instance.created_at = data['created_at']
        if 'updated_at' in data:
            instance.updated_at = data['updated_at']
        if 'schema_version' in data:
            instance.schema_version = data['schema_version']

        return instance

    def update(self, updates: Dict[str, Any]) -> None:
        """
        Updates asset parameters with validation.
        """
        allowed_updates = {
            'name', 'type', 'min_size', 'detection_limit', 
            'properties', 'capabilities'
        }

        invalid_fields = set(updates.keys()) - allowed_updates
        if invalid_fields:
            raise ValidationError(f"Invalid update fields: {invalid_fields}")

        # Apply updates
        for field, value in updates.items():
            setattr(self, field, value)

        # Update timestamp and validate
        self.updated_at = datetime.now(timezone.utc)
        self.validate()