"""
Test suite for location-related services in the Matter satellite data product matching platform.
Implements comprehensive testing of geocoding, location validation, spatial operations,
performance benchmarks, and cache efficiency.

Dependencies:
pytest==7.0.0+
pytest-asyncio==0.21.0+
pytest-benchmark==4.0.0+
pytest-cov==4.1.0+
geojson==3.0.0+
shapely==2.0.0+
fakeredis==2.0.0+
"""

import pytest
import asyncio
import json
from unittest.mock import Mock, patch
import fakeredis
import geojson
from shapely.geometry import shape, mapping

from ...src.services.geocoding_service import GeocodingService, GeocodingError
from ...src.models.location import Location, MAX_AREA_SIZE, VALID_LOCATION_TYPES

# Test constants
TEST_ADDRESS = "100 Main St, New York, NY 10001"
TEST_COORDINATES = {"latitude": 40.7505, "longitude": -73.9965}
TEST_GEOMETRY = {
    "type": "Point",
    "coordinates": [-73.9965, 40.7505]
}
TEST_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[0,0], [0,1], [1,1], [1,0], [0,0]]]
}
PERFORMANCE_THRESHOLD = 3.0  # seconds
CACHE_HIT_RATIO_THRESHOLD = 0.8  # 80% cache hit ratio target

class MockResponse:
    """Mock HTTP response for testing geocoding service."""
    
    def __init__(self, status_code: int, data: dict, headers: dict = None):
        self.status_code = status_code
        self.data = data
        self.headers = headers or {}
        
    async def json(self):
        return self.data
        
    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")

@pytest.fixture
async def geocoding_service():
    """Fixture providing configured geocoding service instance."""
    redis_client = fakeredis.FakeStrictRedis()
    service = GeocodingService(redis_client)
    yield service
    await service.close()

@pytest.fixture
def mock_http_client():
    """Fixture providing mocked HTTP client."""
    with patch('httpx.AsyncClient') as mock_client:
        yield mock_client

@pytest.mark.asyncio
async def test_geocode_address_success(geocoding_service, mock_http_client):
    """Tests successful address geocoding with validation."""
    mock_response = MockResponse(200, {
        "features": [{
            "geometry": TEST_GEOMETRY,
            "properties": {"accuracy": "rooftop"}
        }]
    })
    mock_http_client.return_value.__aenter__.return_value.get.return_value = mock_response
    
    result = await geocoding_service.geocode(TEST_ADDRESS)
    
    assert result["type"] == "Point"
    assert result["coordinates"] == TEST_GEOMETRY["coordinates"]
    assert geocoding_service.metrics["requests_total"] == 1
    assert geocoding_service.metrics["cache_misses"] == 1

@pytest.mark.asyncio
async def test_geocode_address_cache(geocoding_service):
    """Tests geocoding cache functionality and performance."""
    # Populate cache
    cache_key = f"geocode:{TEST_ADDRESS}"
    geocoding_service.cache.set(cache_key, json.dumps(TEST_GEOMETRY))
    
    result = await geocoding_service.geocode(TEST_ADDRESS)
    
    assert result == TEST_GEOMETRY
    assert geocoding_service.metrics["cache_hits"] == 1
    assert geocoding_service.metrics["requests_total"] == 1

@pytest.mark.asyncio
async def test_reverse_geocode_success(geocoding_service, mock_http_client):
    """Tests successful reverse geocoding with validation."""
    mock_response = MockResponse(200, {
        "features": [{
            "place_name": TEST_ADDRESS,
            "geometry": TEST_GEOMETRY
        }]
    })
    mock_http_client.return_value.__aenter__.return_value.get.return_value = mock_response
    
    result = await geocoding_service.reverse_geocode(
        TEST_COORDINATES["latitude"],
        TEST_COORDINATES["longitude"]
    )
    
    assert result == TEST_ADDRESS
    assert geocoding_service.metrics["requests_total"] == 1

@pytest.mark.benchmark
async def test_geocode_performance(geocoding_service, mock_http_client, benchmark):
    """Tests geocoding performance against SLA requirements."""
    mock_response = MockResponse(200, {
        "features": [{
            "geometry": TEST_GEOMETRY,
            "properties": {"accuracy": "rooftop"}
        }]
    })
    mock_http_client.return_value.__aenter__.return_value.get.return_value = mock_response
    
    async def benchmark_geocode():
        return await geocoding_service.geocode(TEST_ADDRESS)
    
    result = benchmark.pedantic(
        lambda: asyncio.run(benchmark_geocode()),
        iterations=100,
        rounds=10
    )
    
    assert result.average < PERFORMANCE_THRESHOLD
    assert geocoding_service.metrics["requests_total"] == 100

@pytest.mark.asyncio
async def test_location_validation(geocoding_service):
    """Tests comprehensive geometry validation."""
    # Test point geometry
    assert geocoding_service.validate_location(TEST_GEOMETRY)
    
    # Test polygon geometry
    assert geocoding_service.validate_location(TEST_POLYGON)
    
    # Test invalid geometry
    invalid_geometry = {
        "type": "Point",
        "coordinates": [200, 100]  # Invalid coordinates
    }
    with pytest.raises(GeocodingError):
        geocoding_service.validate_location(invalid_geometry)
    
    # Test area constraints
    large_polygon = {
        "type": "Polygon",
        "coordinates": [[[0,0], [0,10], [10,10], [10,0], [0,0]]]
    }
    with pytest.raises(GeocodingError):
        geocoding_service.validate_location(large_polygon)

@pytest.mark.asyncio
async def test_cache_efficiency(geocoding_service, mock_http_client):
    """Tests location cache performance and efficiency."""
    mock_response = MockResponse(200, {
        "features": [{
            "geometry": TEST_GEOMETRY,
            "properties": {"accuracy": "rooftop"}
        }]
    })
    mock_http_client.return_value.__aenter__.return_value.get.return_value = mock_response
    
    # Perform multiple requests
    for _ in range(10):
        await geocoding_service.geocode(TEST_ADDRESS)
    
    # Calculate cache hit ratio
    total_requests = (
        geocoding_service.metrics["cache_hits"] +
        geocoding_service.metrics["cache_misses"]
    )
    cache_hit_ratio = (
        geocoding_service.metrics["cache_hits"] / total_requests
        if total_requests > 0 else 0
    )
    
    assert cache_hit_ratio >= CACHE_HIT_RATIO_THRESHOLD
    assert geocoding_service.metrics["errors"] == 0

@pytest.mark.asyncio
async def test_error_handling(geocoding_service, mock_http_client):
    """Tests comprehensive error handling scenarios."""
    # Test API error
    mock_http_client.return_value.__aenter__.return_value.get.side_effect = \
        Exception("API Error")
    
    with pytest.raises(GeocodingError) as exc_info:
        await geocoding_service.geocode(TEST_ADDRESS)
    assert "Geocoding failed" in str(exc_info.value)
    assert geocoding_service.metrics["errors"] == 1
    
    # Test rate limit
    geocoding_service.request_counter = 1001  # Exceed rate limit
    with pytest.raises(GeocodingError) as exc_info:
        await geocoding_service.geocode(TEST_ADDRESS)
    assert "Rate limit exceeded" in str(exc_info.value)

@pytest.mark.asyncio
async def test_coordinate_validation(geocoding_service):
    """Tests coordinate validation and transformation."""
    # Test valid coordinates
    valid_coords = {"latitude": 45.0, "longitude": -73.0}
    result = await geocoding_service.reverse_geocode(
        valid_coords["latitude"],
        valid_coords["longitude"]
    )
    assert isinstance(result, str)
    
    # Test invalid coordinates
    invalid_coords = {"latitude": 100.0, "longitude": 200.0}
    with pytest.raises(GeocodingError):
        await geocoding_service.reverse_geocode(
            invalid_coords["latitude"],
            invalid_coords["longitude"]
        )

@pytest.mark.asyncio
async def test_location_types(geocoding_service):
    """Tests support for different location types."""
    for location_type in VALID_LOCATION_TYPES:
        if location_type == "point":
            geometry = TEST_GEOMETRY
        else:
            geometry = TEST_POLYGON
        
        location = Location(
            search_id="12345678-1234-5678-1234-567812345678",
            type=location_type,
            geometry=geometry
        )
        assert location.type in VALID_LOCATION_TYPES
        assert location.validate_bounds(geometry)