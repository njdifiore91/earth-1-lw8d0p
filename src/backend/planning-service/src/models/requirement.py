from dataclasses import dataclass
from typing import Dict, List, Any, Optional
from uuid import uuid4
from datetime import datetime, timezone
from .asset import Asset, ValidationError

# Constants for validation
VALID_PARAMETER_TYPES = ['TEMPORAL', 'SPATIAL', 'SPECTRAL', 'RADIOMETRIC']
MIN_TIME_WINDOW = 1  # days
MAX_TIME_WINDOW = 365  # days
PARAMETER_UNITS = {
    'TEMPORAL': ['seconds', 'minutes', 'hours'],
    'SPATIAL': ['meters', 'kilometers'],
    'SPECTRAL': ['nanometers', 'micrometers'],
    'RADIOMETRIC': ['bits', 'levels']
}

# Parameter-specific validation ranges
PARAMETER_RANGES = {
    'TEMPORAL': {'min': 1, 'max': 86400},  # seconds (1 sec to 24 hours)
    'SPATIAL': {'min': 0.1, 'max': 1000},  # meters
    'SPECTRAL': {'min': 1, 'max': 2500},   # nanometers
    'RADIOMETRIC': {'min': 1, 'max': 16}    # bits
}

@dataclass
class Requirement:
    """
    Represents a satellite data collection requirement with comprehensive validation 
    and serialization capabilities.
    """
    asset_id: str
    parameter: str
    value: float
    unit: str
    start_time: datetime
    end_time: datetime
    constraints: Dict[str, Any]
    id: str = None
    created_at: datetime = None
    updated_at: datetime = None
    is_active: bool = True

    def __post_init__(self):
        """Initialize default values and validate the requirement"""
        # Generate UUID if not provided
        self.id = self.id or str(uuid4())
        
        # Set timestamps if not provided
        current_time = datetime.now(timezone.utc)
        self.created_at = self.created_at or current_time
        self.updated_at = self.updated_at or current_time
        
        # Initialize empty constraints if None
        self.constraints = self.constraints or {}
        
        # Validate the instance
        self.validate()

    def validate(self) -> bool:
        """
        Performs comprehensive validation of all requirement parameters.
        Raises ValidationError if validation fails.
        """
        # Verify asset exists
        if not Asset.exists(self.asset_id):
            raise ValidationError(f"Asset with ID {self.asset_id} does not exist")

        # Validate parameter type
        if self.parameter not in VALID_PARAMETER_TYPES:
            raise ValidationError(
                f"Invalid parameter type: {self.parameter}. Must be one of {VALID_PARAMETER_TYPES}"
            )

        # Validate unit
        if self.unit not in PARAMETER_UNITS[self.parameter]:
            raise ValidationError(
                f"Invalid unit {self.unit} for parameter {self.parameter}. "
                f"Must be one of {PARAMETER_UNITS[self.parameter]}"
            )

        # Validate time window
        if not isinstance(self.start_time, datetime) or not isinstance(self.end_time, datetime):
            raise ValidationError("Invalid timestamp format for time window")

        if self.start_time >= self.end_time:
            raise ValidationError("Start time must be before end time")

        time_window_days = (self.end_time - self.start_time).days
        if not MIN_TIME_WINDOW <= time_window_days <= MAX_TIME_WINDOW:
            raise ValidationError(
                f"Time window must be between {MIN_TIME_WINDOW} and {MAX_TIME_WINDOW} days"
            )

        # Validate value ranges
        param_range = PARAMETER_RANGES[self.parameter]
        if not param_range['min'] <= self.value <= param_range['max']:
            raise ValidationError(
                f"Value for {self.parameter} must be between "
                f"{param_range['min']} and {param_range['max']} {self.unit}"
            )

        # Validate constraints structure
        if not isinstance(self.constraints, dict):
            raise ValidationError("Constraints must be a dictionary")

        return True

    def to_dict(self) -> Dict[str, Any]:
        """
        Converts requirement instance to dictionary with formatted timestamps.
        """
        return {
            'id': self.id,
            'asset_id': self.asset_id,
            'parameter': self.parameter,
            'value': self.value,
            'unit': self.unit,
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat(),
            'constraints': self.constraints,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'is_active': self.is_active
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Requirement':
        """
        Creates requirement instance from dictionary with validation.
        """
        required_fields = {
            'asset_id', 'parameter', 'value', 'unit', 
            'start_time', 'end_time'
        }
        
        # Validate required fields
        missing_fields = required_fields - set(data.keys())
        if missing_fields:
            raise ValidationError(f"Missing required fields: {missing_fields}")

        # Parse timestamps
        try:
            start_time = datetime.fromisoformat(data['start_time'])
            end_time = datetime.fromisoformat(data['end_time'])
            created_at = datetime.fromisoformat(data['created_at']) if 'created_at' in data else None
            updated_at = datetime.fromisoformat(data['updated_at']) if 'updated_at' in data else None
        except (ValueError, TypeError):
            raise ValidationError("Invalid timestamp format")

        # Create new instance with validation
        instance = cls(
            asset_id=data['asset_id'],
            parameter=data['parameter'],
            value=float(data['value']),
            unit=data['unit'],
            start_time=start_time,
            end_time=end_time,
            constraints=data.get('constraints', {}),
            id=data.get('id'),
            created_at=created_at,
            updated_at=updated_at,
            is_active=data.get('is_active', True)
        )

        return instance

    def update(self, updates: Dict[str, Any]) -> None:
        """
        Updates requirement parameters with validation.
        """
        allowed_updates = {
            'parameter', 'value', 'unit', 'start_time', 'end_time',
            'constraints', 'is_active'
        }

        # Validate update fields
        invalid_fields = set(updates.keys()) - allowed_updates
        if invalid_fields:
            raise ValidationError(f"Invalid update fields: {invalid_fields}")

        # Parse timestamps if present
        if 'start_time' in updates:
            updates['start_time'] = datetime.fromisoformat(updates['start_time'])
        if 'end_time' in updates:
            updates['end_time'] = datetime.fromisoformat(updates['end_time'])

        # Apply updates
        for field, value in updates.items():
            setattr(self, field, value)

        # Update timestamp and validate
        self.updated_at = datetime.now(timezone.utc)
        self.validate()