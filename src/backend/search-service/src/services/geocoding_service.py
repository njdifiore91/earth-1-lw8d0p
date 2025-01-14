"""
Geocoding service module for the Matter satellite data product matching platform.
Provides robust address-to-coordinate conversion and reverse geocoding with caching,
monitoring, and comprehensive error handling.

Dependencies:
httpx==0.24.0+
geojson==3.0.0+
pydantic==2.0.0+
redis==4.5.0+
"""

import os
import re
import logging
from typing import Dict, Optional
from datetime import datetime, timedelta
from urllib.parse import quote_plus

import httpx
import geojson
import redis
from pydantic import BaseModel, ValidationError

from ..utils.spatial_utils import transform_coordinates, validate_bounds
from ..schemas.location_schema import LocationBase

# Configure logging
logger = logging.getLogger(__name__)

# Environment variables and constants
GEOCODING_API_URL = os.getenv('GEOCODING_API_URL', 'https://api.mapbox.com/geocoding/v5/mapbox.places')
GEOCODING_API_KEY = os.getenv('GEOCODING_API_KEY')
CACHE_TTL = int(os.getenv('GEOCODING_CACHE_TTL', '3600'))  # 1 hour default
MAX_RESULTS = int(os.getenv('GEOCODING_MAX_RESULTS', '5'))
API_RATE_LIMIT = int(os.getenv('GEOCODING_RATE_LIMIT', '1000'))  # requests per hour
ALERT_THRESHOLD = float(os.getenv('GEOCODING_ALERT_THRESHOLD', '0.8'))  # 80% of rate limit

class GeocodingError(Exception):
    """Custom exception for geocoding-related errors with enhanced context."""
    def __init__(self, message: str, details: Optional[Dict] = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)

def format_address(address: str) -> str:
    """
    Formats address string for geocoding request with enhanced normalization.
    
    Args:
        address: Raw address string
        
    Returns:
        Normalized and URL-safe address string
    """
    try:
        # Remove special characters except commas and spaces
        cleaned = re.sub(r'[^\w\s,]', '', address)
        
        # Normalize whitespace
        normalized = ' '.join(cleaned.split())
        
        # URL encode
        return quote_plus(normalized)
        
    except Exception as e:
        logger.error(f"Address formatting failed: {str(e)}")
        raise GeocodingError("Address formatting failed", {"error": str(e)})

class GeocodingService:
    """Service class for handling geocoding operations with enhanced monitoring and resilience."""
    
    def __init__(self, redis_client: redis.Redis):
        """
        Initialize geocoding service with monitoring and resilience features.
        
        Args:
            redis_client: Redis client instance for caching
        """
        if not GEOCODING_API_KEY:
            raise GeocodingError("Missing Geocoding API key")
            
        # Initialize HTTP client with retry configuration
        self.client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
            headers={"Authorization": f"Bearer {GEOCODING_API_KEY}"}
        )
        
        self.cache = redis_client
        self.api_key = GEOCODING_API_KEY
        self.request_counter = 0
        self.last_reset = datetime.utcnow()
        
        # Initialize monitoring
        self._setup_monitoring()

    def _setup_monitoring(self):
        """Configure service monitoring and alerts."""
        self.metrics = {
            "requests_total": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "errors": 0,
            "last_error": None
        }

    async def geocode(self, address: str) -> Dict:
        """
        Converts address to coordinates with enhanced error handling.
        
        Args:
            address: Address string to geocode
            
        Returns:
            GeoJSON geometry object with coordinates
            
        Raises:
            GeocodingError: If geocoding fails
        """
        try:
            # Check rate limit
            await self._check_rate_limit()
            
            # Check cache
            cache_key = f"geocode:{address}"
            cached_result = self.cache.get(cache_key)
            if cached_result:
                self.metrics["cache_hits"] += 1
                return geojson.loads(cached_result)
                
            self.metrics["cache_misses"] += 1
            
            # Format address
            formatted_address = format_address(address)
            
            # Make API request
            url = f"{GEOCODING_API_URL}/{formatted_address}.json"
            async with self.client as client:
                response = await client.get(url, params={
                    "limit": MAX_RESULTS,
                    "types": "address,place,locality"
                })
                response.raise_for_status()
                
            data = response.json()
            if not data.get("features"):
                raise GeocodingError("No results found", {"address": address})
                
            # Get first result
            feature = data["features"][0]
            geometry = feature["geometry"]
            
            # Validate coordinates
            if not validate_bounds(geometry):
                raise GeocodingError("Invalid coordinates", {"geometry": geometry})
                
            # Cache result
            self.cache.setex(
                cache_key,
                CACHE_TTL,
                geojson.dumps(geometry)
            )
            
            # Update metrics
            self.metrics["requests_total"] += 1
            self.request_counter += 1
            
            return geometry
            
        except httpx.HTTPError as e:
            self.metrics["errors"] += 1
            self.metrics["last_error"] = str(e)
            logger.error(f"Geocoding request failed: {str(e)}")
            raise GeocodingError("Geocoding request failed", {"error": str(e)})
            
        except Exception as e:
            self.metrics["errors"] += 1
            self.metrics["last_error"] = str(e)
            logger.error(f"Geocoding failed: {str(e)}")
            raise GeocodingError("Geocoding failed", {"error": str(e)})

    async def reverse_geocode(self, latitude: float, longitude: float) -> str:
        """
        Converts coordinates to address with enhanced error handling.
        
        Args:
            latitude: Latitude coordinate
            longitude: Longitude coordinate
            
        Returns:
            Formatted address string
            
        Raises:
            GeocodingError: If reverse geocoding fails
        """
        try:
            # Check rate limit
            await self._check_rate_limit()
            
            # Check cache
            cache_key = f"revgeocode:{latitude},{longitude}"
            cached_result = self.cache.get(cache_key)
            if cached_result:
                self.metrics["cache_hits"] += 1
                return cached_result.decode('utf-8')
                
            self.metrics["cache_misses"] += 1
            
            # Validate coordinates
            geometry = {
                "type": "Point",
                "coordinates": [longitude, latitude]
            }
            if not validate_bounds(geometry):
                raise GeocodingError("Invalid coordinates", {
                    "latitude": latitude,
                    "longitude": longitude
                })
            
            # Make API request
            url = f"{GEOCODING_API_URL}/{longitude},{latitude}.json"
            async with self.client as client:
                response = await client.get(url, params={
                    "types": "address,place,locality"
                })
                response.raise_for_status()
                
            data = response.json()
            if not data.get("features"):
                raise GeocodingError("No results found", {
                    "latitude": latitude,
                    "longitude": longitude
                })
                
            # Get formatted address
            feature = data["features"][0]
            address = feature["place_name"]
            
            # Cache result
            self.cache.setex(
                cache_key,
                CACHE_TTL,
                address
            )
            
            # Update metrics
            self.metrics["requests_total"] += 1
            self.request_counter += 1
            
            return address
            
        except httpx.HTTPError as e:
            self.metrics["errors"] += 1
            self.metrics["last_error"] = str(e)
            logger.error(f"Reverse geocoding request failed: {str(e)}")
            raise GeocodingError("Reverse geocoding request failed", {"error": str(e)})
            
        except Exception as e:
            self.metrics["errors"] += 1
            self.metrics["last_error"] = str(e)
            logger.error(f"Reverse geocoding failed: {str(e)}")
            raise GeocodingError("Reverse geocoding failed", {"error": str(e)})

    def validate_location(self, geometry: Dict) -> bool:
        """
        Validates geocoded location data.
        
        Args:
            geometry: GeoJSON geometry object
            
        Returns:
            True if location is valid
            
        Raises:
            GeocodingError: If validation fails
        """
        try:
            # Create location schema
            location = LocationBase(
                type="point" if geometry["type"] == "Point" else "polygon",
                geometry=geometry
            )
            
            # Validate using schema
            return location.validate()
            
        except ValidationError as e:
            logger.error(f"Location validation failed: {str(e)}")
            raise GeocodingError("Location validation failed", {"error": str(e)})
            
        except Exception as e:
            logger.error(f"Location validation failed: {str(e)}")
            raise GeocodingError("Location validation failed", {"error": str(e)})

    async def _check_rate_limit(self):
        """
        Checks API rate limit status with quota management.
        
        Raises:
            GeocodingError: If rate limit exceeded
        """
        # Reset counter if hour has passed
        now = datetime.utcnow()
        if now - self.last_reset > timedelta(hours=1):
            self.request_counter = 0
            self.last_reset = now
            
        # Check current usage
        if self.request_counter >= API_RATE_LIMIT:
            raise GeocodingError("Rate limit exceeded", {
                "limit": API_RATE_LIMIT,
                "reset_time": self.last_reset + timedelta(hours=1)
            })
            
        # Alert if approaching limit
        if self.request_counter >= (API_RATE_LIMIT * ALERT_THRESHOLD):
            logger.warning(f"Approaching rate limit: {self.request_counter}/{API_RATE_LIMIT}")

    async def close(self):
        """Cleanup resources on service shutdown."""
        await self.client.aclose()