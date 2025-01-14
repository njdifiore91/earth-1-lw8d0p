"""
Location model for the search service with comprehensive PostGIS integration.
Implements advanced spatial operations, geometry validation, and optimized storage.

Dependencies:
sqlalchemy==2.0.0+
geoalchemy2==0.13.0+
shapely==2.0.0+
pyproj==3.5.0+
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Optional
import uuid

from geoalchemy2 import Geometry
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import shape, mapping
from shapely.ops import transform
from pyproj import CRS, Transformer
from sqlalchemy import Column, DateTime, String, ForeignKey, Index, JSON
from sqlalchemy.dialects.postgresql import UUID

from ..config.database import create_engine

# Constants for validation and configuration
MAX_AREA_SIZE = 100000  # Maximum area in square kilometers
VALID_LOCATION_TYPES = ['polygon', 'point', 'multipolygon']
DEFAULT_SRID = 4326  # WGS84
COORDINATE_BOUNDS = {
    "lat": [-90, 90],
    "lon": [-180, 180]
}

@dataclass
class Location:
    """Enhanced SQLAlchemy model for geographic locations with optimized spatial operations."""
    
    __tablename__ = 'locations'
    
    # Primary columns with optimized indexing
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    search_id = Column(
        UUID(as_uuid=True), 
        ForeignKey('searches.id', ondelete='CASCADE'),
        nullable=False,
        index=True
    )
    type = Column(String, nullable=False)
    geometry = Column(Geometry(srid=DEFAULT_SRID, spatial_index=True), nullable=False)
    metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Optimized indexes
    __table_args__ = (
        Index('idx_locations_search_type', 'search_id', 'type'),
        Index('idx_locations_updated', 'updated_at'),
    )
    
    def __init__(self, search_id: uuid.UUID, type: str, geometry: Dict, metadata: Optional[Dict] = None):
        """Initialize Location instance with comprehensive validation.
        
        Args:
            search_id: UUID of associated search
            type: Location type (must be in VALID_LOCATION_TYPES)
            geometry: GeoJSON geometry dictionary
            metadata: Optional metadata dictionary
        
        Raises:
            ValueError: If validation fails for any input
        """
        if type not in VALID_LOCATION_TYPES:
            raise ValueError(f"Invalid location type. Must be one of: {VALID_LOCATION_TYPES}")
            
        if not self.validate_bounds(geometry):
            raise ValueError("Invalid geometry bounds")
            
        area = self.calculate_area(geometry)
        if area > MAX_AREA_SIZE:
            raise ValueError(f"Area exceeds maximum size of {MAX_AREA_SIZE} km²")
            
        self.id = uuid.uuid4()
        self.search_id = search_id
        self.type = type
        self.geometry = from_shape(shape(geometry), srid=DEFAULT_SRID)
        self.metadata = metadata or {}
        self.created_at = datetime.utcnow()
        self.updated_at = self.created_at
    
    def update_geometry(self, new_geometry: Dict) -> bool:
        """Updates location geometry with validation and optimization.
        
        Args:
            new_geometry: New GeoJSON geometry dictionary
            
        Returns:
            bool: True if update successful
            
        Raises:
            ValueError: If geometry validation fails
        """
        if not self.validate_bounds(new_geometry):
            raise ValueError("Invalid geometry bounds")
            
        area = self.calculate_area(new_geometry)
        if area > MAX_AREA_SIZE:
            raise ValueError(f"Area exceeds maximum size of {MAX_AREA_SIZE} km²")
            
        self.geometry = from_shape(shape(new_geometry), srid=DEFAULT_SRID)
        self.updated_at = datetime.utcnow()
        return True
    
    @staticmethod
    def transform_coordinates(geometry: Dict, source_srid: int, target_srid: int) -> Dict:
        """Transforms coordinates between different spatial reference systems.
        
        Args:
            geometry: GeoJSON geometry dictionary
            source_srid: Source SRID
            target_srid: Target SRID
            
        Returns:
            Dict: Transformed geometry
            
        Raises:
            ValueError: If transformation fails
        """
        try:
            source_crs = CRS.from_epsg(source_srid)
            target_crs = CRS.from_epsg(target_srid)
            transformer = Transformer.from_crs(source_crs, target_crs, always_xy=True)
            
            geom = shape(geometry)
            transformed = transform(transformer.transform, geom)
            return mapping(transformed)
        except Exception as e:
            raise ValueError(f"Coordinate transformation failed: {str(e)}")
    
    @staticmethod
    def calculate_area(geometry: Dict) -> float:
        """Calculates area of geometry in square kilometers.
        
        Args:
            geometry: GeoJSON geometry dictionary
            
        Returns:
            float: Area in square kilometers
            
        Raises:
            ValueError: If area calculation fails
        """
        try:
            geom = shape(geometry)
            if geom.is_empty:
                raise ValueError("Empty geometry")
                
            # Transform to equal area projection for accurate calculation
            equal_area_geom = Location.transform_coordinates(
                geometry,
                DEFAULT_SRID,
                3857  # Web Mercator projection
            )
            transformed = shape(equal_area_geom)
            
            # Convert to square kilometers with precision control
            area_km2 = transformed.area / 1_000_000  # m² to km²
            return round(area_km2, 6)
        except Exception as e:
            raise ValueError(f"Area calculation failed: {str(e)}")
    
    @staticmethod
    def validate_bounds(geometry: Dict) -> bool:
        """Validates coordinate bounds with comprehensive checks.
        
        Args:
            geometry: GeoJSON geometry dictionary
            
        Returns:
            bool: True if bounds are valid
        """
        try:
            geom = shape(geometry)
            if geom.is_empty:
                return False
                
            bounds = geom.bounds
            
            # Check longitude bounds
            if bounds[0] < COORDINATE_BOUNDS["lon"][0] or bounds[2] > COORDINATE_BOUNDS["lon"][1]:
                return False
                
            # Check latitude bounds
            if bounds[1] < COORDINATE_BOUNDS["lat"][0] or bounds[3] > COORDINATE_BOUNDS["lat"][1]:
                return False
                
            # Validate topology
            if not geom.is_valid:
                return False
                
            return True
        except Exception:
            return False