"""
SQLAlchemy model for satellite data search requests with enhanced security,
validation, and audit capabilities for handling locations, assets, and requirements.

Dependencies:
sqlalchemy==2.0.0+
geoalchemy2==0.13.0+
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
import uuid
from typing import List, Dict, Tuple, Optional

from sqlalchemy import Column, DateTime, String, Integer, ForeignKey, JSON, event
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property

from ..config.database import create_engine
from .location import Location, validate_geometry

# Search status and validation constants
SEARCH_STATUS_TYPES = ['draft', 'submitted', 'processing', 'completed', 'archived', 'deleted']
ASSET_TYPES = ['environmental', 'infrastructure', 'agriculture', 'custom']
MAX_SEARCH_DURATION_DAYS = 90
MAX_ASSETS_PER_SEARCH = 5
DATA_CLASSIFICATION_LEVELS = ['public', 'internal', 'confidential', 'restricted']
MAX_LOCATIONS_PER_BULK_OPERATION = 100

# Valid status transitions for state machine
STATUS_TRANSITIONS = {
    'draft': ['submitted', 'deleted'],
    'submitted': ['processing', 'archived'],
    'processing': ['completed', 'archived'],
    'completed': ['archived'],
    'archived': ['deleted'],
    'deleted': []
}

@dataclass(frozen=True)
class Search:
    """Enhanced SQLAlchemy model for satellite data search requests with security features."""
    
    __tablename__ = 'searches'
    
    # Primary columns with security considerations
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    status = Column(String, nullable=False, default='draft')
    parameters = Column(JSON, nullable=False)
    classification_level = Column(String, nullable=False)
    version = Column(Integer, nullable=False, default=1)
    
    # Audit trail timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    archived_at = Column(DateTime, nullable=True)
    
    # Relationships with cascading delete
    locations = relationship(
        "Location",
        backref="search",
        cascade="all, delete-orphan",
        lazy="joined"
    )
    
    # Optimized indexes and constraints
    __table_args__ = (
        Index('idx_searches_user_status', 'user_id', 'status'),
        Index('idx_searches_classification', 'classification_level'),
        CheckConstraint(f"status = ANY(ARRAY{SEARCH_STATUS_TYPES}::varchar[])"),
        CheckConstraint(f"classification_level = ANY(ARRAY{DATA_CLASSIFICATION_LEVELS}::varchar[])")
    )
    
    def __init__(self, user_id: uuid.UUID, parameters: Dict, classification_level: str):
        """Initialize search instance with comprehensive validation.
        
        Args:
            user_id: UUID of the user creating the search
            parameters: Search parameters dictionary
            classification_level: Data security classification
            
        Raises:
            ValueError: If validation fails for any input
        """
        is_valid, error_msg = validate_search_parameters(parameters, classification_level)
        if not is_valid:
            raise ValueError(error_msg)
            
        self.id = uuid.uuid4()
        self.user_id = user_id
        self.parameters = parameters
        self.classification_level = classification_level
        self.status = 'draft'
        self.version = 1
        self.created_at = datetime.utcnow()
        self.updated_at = self.created_at
        
    def update_status(self, new_status: str) -> bool:
        """Updates search status with state machine validation.
        
        Args:
            new_status: New status value
            
        Returns:
            bool: True if status was updated successfully
            
        Raises:
            ValueError: If status transition is invalid
        """
        if new_status not in SEARCH_STATUS_TYPES:
            raise ValueError(f"Invalid status. Must be one of: {SEARCH_STATUS_TYPES}")
            
        if new_status not in STATUS_TRANSITIONS[self.status]:
            raise ValueError(f"Invalid status transition from {self.status} to {new_status}")
            
        self.status = new_status
        self.updated_at = datetime.utcnow()
        
        if new_status == 'archived':
            self.archived_at = datetime.utcnow()
            
        return True
        
    def bulk_add_locations(self, locations: List[Location]) -> Tuple[bool, List[str]]:
        """Adds multiple locations with comprehensive validation.
        
        Args:
            locations: List of Location instances to add
            
        Returns:
            Tuple containing:
                bool: True if operation was successful
                List[str]: List of error messages if any
                
        Raises:
            ValueError: If validation fails
        """
        if len(locations) > MAX_LOCATIONS_PER_BULK_OPERATION:
            raise ValueError(f"Maximum of {MAX_LOCATIONS_PER_BULK_OPERATION} locations allowed")
            
        errors = []
        valid_locations = []
        
        for location in locations:
            try:
                if not validate_geometry(location.geometry):
                    errors.append(f"Invalid geometry for location {location.id}")
                    continue
                    
                valid_locations.append(location)
            except Exception as e:
                errors.append(f"Error processing location: {str(e)}")
                
        if valid_locations:
            self.locations.extend(valid_locations)
            self.updated_at = datetime.utcnow()
            
        return len(errors) == 0, errors
        
    @hybrid_property
    def is_active(self) -> bool:
        """Checks if search is active based on status.
        
        Returns:
            bool: True if search is active
        """
        return self.status not in ['archived', 'deleted']
        
    @hybrid_property
    def duration_days(self) -> int:
        """Calculates search duration in days.
        
        Returns:
            int: Duration in days
        """
        start_date = self.parameters.get('temporal_window', {}).get('start')
        end_date = self.parameters.get('temporal_window', {}).get('end')
        
        if not (start_date and end_date):
            return 0
            
        try:
            start = datetime.fromisoformat(start_date)
            end = datetime.fromisoformat(end_date)
            return (end - start).days
        except ValueError:
            return 0

@staticmethod
def validate_search_parameters(parameters: Dict, classification_level: str) -> Tuple[bool, str]:
    """Enhanced validation of search parameters with security checks.
    
    Args:
        parameters: Search parameters dictionary
        classification_level: Data security classification
        
    Returns:
        Tuple containing:
            bool: True if parameters are valid
            str: Error message if validation fails
    """
    try:
        # Validate temporal window
        temporal = parameters.get('temporal_window', {})
        if not temporal or not all(k in temporal for k in ['start', 'end']):
            return False, "Missing temporal window parameters"
            
        start = datetime.fromisoformat(temporal['start'])
        end = datetime.fromisoformat(temporal['end'])
        
        if (end - start).days > MAX_SEARCH_DURATION_DAYS:
            return False, f"Search duration exceeds {MAX_SEARCH_DURATION_DAYS} days"
            
        # Validate assets
        assets = parameters.get('assets', [])
        if not assets:
            return False, "No assets specified"
            
        if len(assets) > MAX_ASSETS_PER_SEARCH:
            return False, f"Maximum {MAX_ASSETS_PER_SEARCH} assets allowed"
            
        for asset in assets:
            if asset.get('type') not in ASSET_TYPES:
                return False, f"Invalid asset type. Must be one of: {ASSET_TYPES}"
                
        # Validate classification level
        if classification_level not in DATA_CLASSIFICATION_LEVELS:
            return False, f"Invalid classification level. Must be one of: {DATA_CLASSIFICATION_LEVELS}"
            
        # Validate requirements structure
        for asset in assets:
            requirements = asset.get('requirements', {})
            if not requirements:
                return False, "Missing requirements for asset"
                
            if not all(isinstance(v, (int, float, str)) for v in requirements.values()):
                return False, "Invalid requirement value type"
                
        return True, ""
        
    except ValueError as e:
        return False, f"Validation error: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error during validation: {str(e)}"

# Event listeners for audit logging
@event.listens_for(Search, 'before_update')
def receive_before_update(mapper, connection, target):
    """Audit logging for search updates."""
    target.version += 1