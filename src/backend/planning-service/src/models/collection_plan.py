from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
from uuid import uuid4
from pydantic import ValidationError  # v2.0.0+

from .asset import Asset
from .requirement import Requirement

# Constants for validation
PLAN_STATUS_TYPES = ['DRAFT', 'PROCESSING', 'OPTIMIZED', 'FAILED']
MIN_CONFIDENCE_SCORE = 0.0
MAX_CONFIDENCE_SCORE = 1.0
MIN_WINDOW_DURATION = 300  # 5 minutes in seconds

@dataclass
class CollectionWindow:
    """
    Represents a time window for satellite data collection with confidence scoring and validation.
    """
    start_time: datetime
    end_time: datetime
    confidence_score: float
    parameters: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        """Validate instance after initialization"""
        self.validate()

    def validate(self) -> bool:
        """
        Validates collection window parameters with comprehensive checks.
        Raises ValidationError if validation fails.
        """
        # Validate time window
        if self.start_time >= self.end_time:
            raise ValidationError("Start time must be before end time")

        # Validate window duration
        duration = (self.end_time - self.start_time).total_seconds()
        if duration < MIN_WINDOW_DURATION:
            raise ValidationError(
                f"Collection window duration must be at least {MIN_WINDOW_DURATION} seconds"
            )

        # Validate confidence score
        if not MIN_CONFIDENCE_SCORE <= self.confidence_score <= MAX_CONFIDENCE_SCORE:
            raise ValidationError(
                f"Confidence score must be between {MIN_CONFIDENCE_SCORE} and {MAX_CONFIDENCE_SCORE}"
            )

        # Validate parameters structure
        if not isinstance(self.parameters, dict):
            raise ValidationError("Parameters must be a dictionary")

        return True

@dataclass
class CollectionPlan:
    """
    Main class representing a satellite data collection plan with comprehensive validation 
    and optimization support.
    """
    search_id: str
    asset: Asset
    requirements: List[Requirement]
    start_time: datetime
    end_time: datetime
    optimization_parameters: Dict[str, Any] = field(default_factory=dict)
    id: str = field(default_factory=lambda: str(uuid4()))
    status: str = field(default='DRAFT')
    confidence_score: float = field(default=0.0)
    collection_windows: List[CollectionWindow] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __post_init__(self):
        """Validate instance after initialization"""
        self.validate()

    def validate(self) -> bool:
        """
        Validates all collection plan parameters with comprehensive checks.
        Raises ValidationError if validation fails.
        """
        # Validate asset
        self.asset.validate()

        # Validate requirements
        for requirement in self.requirements:
            requirement.validate()

        # Validate time range
        if self.start_time >= self.end_time:
            raise ValidationError("Start time must be before end time")

        # Validate status
        if self.status not in PLAN_STATUS_TYPES:
            raise ValidationError(f"Invalid status: {self.status}. Must be one of {PLAN_STATUS_TYPES}")

        # Validate confidence score
        if not MIN_CONFIDENCE_SCORE <= self.confidence_score <= MAX_CONFIDENCE_SCORE:
            raise ValidationError(
                f"Confidence score must be between {MIN_CONFIDENCE_SCORE} and {MAX_CONFIDENCE_SCORE}"
            )

        # Validate collection windows
        for window in self.collection_windows:
            window.validate()
            if window.start_time < self.start_time or window.end_time > self.end_time:
                raise ValidationError("Collection window must be within plan time range")

        # Validate optimization parameters
        if not isinstance(self.optimization_parameters, dict):
            raise ValidationError("Optimization parameters must be a dictionary")

        return True

    def add_collection_window(self, window: CollectionWindow) -> None:
        """
        Adds a new collection window to the plan with validation.
        """
        # Validate window
        window.validate()

        # Check window is within plan time range
        if window.start_time < self.start_time or window.end_time > self.end_time:
            raise ValidationError("Collection window must be within plan time range")

        # Check for overlaps with existing windows
        for existing_window in self.collection_windows:
            if (window.start_time < existing_window.end_time and 
                window.end_time > existing_window.start_time):
                raise ValidationError("Collection windows cannot overlap")

        # Add window and update plan confidence score
        self.collection_windows.append(window)
        if self.collection_windows:
            self.confidence_score = sum(w.confidence_score for w in self.collection_windows) / len(self.collection_windows)
        
        self.updated_at = datetime.now(timezone.utc)

    def update_status(self, new_status: str) -> None:
        """
        Updates the plan status with validation.
        """
        if new_status not in PLAN_STATUS_TYPES:
            raise ValidationError(f"Invalid status: {new_status}. Must be one of {PLAN_STATUS_TYPES}")

        # Validate status transition
        valid_transitions = {
            'DRAFT': ['PROCESSING'],
            'PROCESSING': ['OPTIMIZED', 'FAILED'],
            'OPTIMIZED': [],
            'FAILED': ['DRAFT']
        }

        if new_status not in valid_transitions[self.status]:
            raise ValidationError(f"Invalid status transition from {self.status} to {new_status}")

        self.status = new_status
        self.updated_at = datetime.now(timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        """
        Converts plan instance to dictionary representation.
        """
        return {
            'id': self.id,
            'search_id': self.search_id,
            'asset': self.asset.to_dict(),
            'requirements': [req.to_dict() for req in self.requirements],
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat(),
            'status': self.status,
            'confidence_score': self.confidence_score,
            'collection_windows': [
                {
                    'start_time': w.start_time.isoformat(),
                    'end_time': w.end_time.isoformat(),
                    'confidence_score': w.confidence_score,
                    'parameters': w.parameters
                } for w in self.collection_windows
            ],
            'optimization_parameters': self.optimization_parameters,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'CollectionPlan':
        """
        Creates plan instance from dictionary data with validation.
        """
        required_fields = {
            'search_id', 'asset', 'requirements', 'start_time', 'end_time'
        }
        
        # Validate required fields
        missing_fields = required_fields - set(data.keys())
        if missing_fields:
            raise ValidationError(f"Missing required fields: {missing_fields}")

        # Parse timestamps
        start_time = datetime.fromisoformat(data['start_time'])
        end_time = datetime.fromisoformat(data['end_time'])

        # Create asset and requirements instances
        asset = Asset.from_dict(data['asset'])
        requirements = [Requirement.from_dict(req) for req in data['requirements']]

        # Create collection windows if present
        collection_windows = []
        if 'collection_windows' in data:
            for window_data in data['collection_windows']:
                window = CollectionWindow(
                    start_time=datetime.fromisoformat(window_data['start_time']),
                    end_time=datetime.fromisoformat(window_data['end_time']),
                    confidence_score=window_data['confidence_score'],
                    parameters=window_data.get('parameters', {})
                )
                collection_windows.append(window)

        # Create new instance
        instance = cls(
            search_id=data['search_id'],
            asset=asset,
            requirements=requirements,
            start_time=start_time,
            end_time=end_time,
            optimization_parameters=data.get('optimization_parameters', {})
        )

        # Set additional fields if present
        if 'id' in data:
            instance.id = data['id']
        if 'status' in data:
            instance.status = data['status']
        if 'confidence_score' in data:
            instance.confidence_score = data['confidence_score']
        if collection_windows:
            instance.collection_windows = collection_windows
        if 'created_at' in data:
            instance.created_at = datetime.fromisoformat(data['created_at'])
        if 'updated_at' in data:
            instance.updated_at = datetime.fromisoformat(data['updated_at'])

        return instance