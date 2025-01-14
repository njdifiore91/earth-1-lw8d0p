"""
Spatial data processing utilities for the Matter satellite data product matching platform.
Provides high-performance coordinate transformations, area calculations, and geometry validation.

Dependencies:
shapely==2.0.0
pyproj==3.5.0
geojson==3.0.0
"""

from functools import lru_cache, wraps
from typing import Dict, List, Tuple, Union, Optional
import logging
from shapely.geometry import shape, mapping
from shapely.ops import transform
from shapely.validation import explain_validity
import pyproj
import geojson
from geojson.validation import is_valid

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
DEFAULT_SRID = 4326  # WGS84
EQUAL_AREA_SRID = 6933  # World Equal Area projection
COORDINATE_PRECISION = 6  # Decimal places for coordinate rounding
LAT_MIN = -90.0
LAT_MAX = 90.0
LON_MIN = -180.0
LON_MAX = 180.0

# Cache configuration
CACHE_SIZE = 1024  # LRU cache size for transformations

def validate_input(func):
    """Decorator for input validation with detailed error reporting."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            # Validate first argument is a GeoJSON geometry
            if not args or not isinstance(args[0], dict):
                raise ValueError("First argument must be a GeoJSON geometry dictionary")
            
            if not is_valid(args[0]):
                raise ValueError(f"Invalid GeoJSON geometry: {geojson.validation.check(args[0])}")
            
            return func(*args, **kwargs)
        except Exception as e:
            logger.error(f"Input validation failed in {func.__name__}: {str(e)}")
            raise
    return wrapper

def cache_result(func):
    """Decorator for caching results with size limit."""
    @wraps(func)
    @lru_cache(maxsize=CACHE_SIZE)
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper

@validate_input
@cache_result
def transform_coordinates(
    geometry: Dict,
    source_srid: int = DEFAULT_SRID,
    target_srid: int = DEFAULT_SRID
) -> Dict:
    """
    Transform coordinates between spatial reference systems with validation and caching.
    
    Args:
        geometry: GeoJSON geometry object
        source_srid: Source coordinate reference system ID
        target_srid: Target coordinate reference system ID
    
    Returns:
        Dict: Transformed geometry in GeoJSON format
    """
    try:
        # Create transformer with cache
        transformer = pyproj.Transformer.from_crs(
            f"EPSG:{source_srid}",
            f"EPSG:{target_srid}",
            always_xy=True
        ).transform
        
        # Convert to shapely
        geom = shape(geometry)
        
        # Validate geometry
        if not geom.is_valid:
            raise ValueError(f"Invalid geometry: {explain_validity(geom)}")
        
        # Transform coordinates
        transformed = transform(transformer, geom)
        
        # Round coordinates
        result = mapping(transformed)
        return round_coordinates(result, COORDINATE_PRECISION)
        
    except Exception as e:
        logger.error(f"Coordinate transformation failed: {str(e)}")
        raise

@validate_input
@cache_result
def calculate_area(geometry: Dict) -> float:
    """
    Calculate area in square kilometers with edge case handling.
    
    Args:
        geometry: GeoJSON geometry object
    
    Returns:
        float: Area in square kilometers
    """
    try:
        # Transform to equal area projection
        equal_area_geom = transform_coordinates(geometry, DEFAULT_SRID, EQUAL_AREA_SRID)
        
        # Calculate area
        area_m2 = shape(equal_area_geom).area
        
        # Convert to km² and round to 3 decimal places
        return round(area_m2 / 1_000_000, 3)
        
    except Exception as e:
        logger.error(f"Area calculation failed: {str(e)}")
        raise

@validate_input
def validate_bounds(geometry: Dict) -> bool:
    """
    Validate coordinate bounds with comprehensive checks.
    
    Args:
        geometry: GeoJSON geometry object
    
    Returns:
        bool: True if bounds are valid
    """
    try:
        coordinates = extract_coordinates(geometry)
        
        for lon, lat in coordinates:
            if not LAT_MIN <= lat <= LAT_MAX:
                raise ValueError(f"Latitude {lat} outside valid range [{LAT_MIN}, {LAT_MAX}]")
            if not LON_MIN <= lon <= LON_MAX:
                raise ValueError(f"Longitude {lon} outside valid range [{LON_MIN}, {LON_MAX}]")
        
        # Validate geometry topology
        if not shape(geometry).is_valid:
            raise ValueError(f"Invalid geometry topology: {explain_validity(shape(geometry))}")
        
        return True
        
    except Exception as e:
        logger.error(f"Bounds validation failed: {str(e)}")
        return False

@validate_input
def extract_coordinates(geometry: Dict) -> List[Tuple[float, float]]:
    """
    Extract coordinate list from GeoJSON geometry with type support.
    
    Args:
        geometry: GeoJSON geometry object
    
    Returns:
        List[Tuple[float, float]]: List of coordinate tuples
    """
    try:
        coords = []
        geom_type = geometry['type']
        
        if geom_type == 'Point':
            coords.append(tuple(geometry['coordinates']))
        elif geom_type == 'LineString':
            coords.extend([tuple(c) for c in geometry['coordinates']])
        elif geom_type == 'Polygon':
            for ring in geometry['coordinates']:
                coords.extend([tuple(c) for c in ring])
        elif geom_type == 'MultiPoint':
            coords.extend([tuple(c) for c in geometry['coordinates']])
        elif geom_type == 'MultiLineString':
            for line in geometry['coordinates']:
                coords.extend([tuple(c) for c in line])
        elif geom_type == 'MultiPolygon':
            for polygon in geometry['coordinates']:
                for ring in polygon:
                    coords.extend([tuple(c) for c in ring])
        elif geom_type == 'GeometryCollection':
            for geom in geometry['geometries']:
                coords.extend(extract_coordinates(geom))
        else:
            raise ValueError(f"Unsupported geometry type: {geom_type}")
        
        return coords
        
    except Exception as e:
        logger.error(f"Coordinate extraction failed: {str(e)}")
        raise

@validate_input
def round_coordinates(geometry: Dict, precision: int = COORDINATE_PRECISION) -> Dict:
    """
    Round coordinates while preserving topology.
    
    Args:
        geometry: GeoJSON geometry object
        precision: Number of decimal places
    
    Returns:
        Dict: Geometry with rounded coordinates
    """
    try:
        if not 0 <= precision <= 20:
            raise ValueError(f"Precision must be between 0 and 20, got {precision}")
        
        def round_coord(coord):
            return tuple(round(c, precision) for c in coord)
        
        geom_type = geometry['type']
        
        if geom_type == 'Point':
            geometry['coordinates'] = round_coord(geometry['coordinates'])
        elif geom_type in ('LineString', 'MultiPoint'):
            geometry['coordinates'] = [round_coord(c) for c in geometry['coordinates']]
        elif geom_type == 'Polygon':
            geometry['coordinates'] = [[round_coord(c) for c in ring] 
                                    for ring in geometry['coordinates']]
        elif geom_type == 'MultiLineString':
            geometry['coordinates'] = [[round_coord(c) for c in line] 
                                    for line in geometry['coordinates']]
        elif geom_type == 'MultiPolygon':
            geometry['coordinates'] = [[[round_coord(c) for c in ring]
                                    for ring in polygon]
                                    for polygon in geometry['coordinates']]
        elif geom_type == 'GeometryCollection':
            geometry['geometries'] = [round_coordinates(geom, precision)
                                    for geom in geometry['geometries']]
        
        # Validate rounded geometry
        if not shape(geometry).is_valid:
            raise ValueError("Rounding operation produced invalid geometry")
        
        return geometry
        
    except Exception as e:
        logger.error(f"Coordinate rounding failed: {str(e)}")
        raise