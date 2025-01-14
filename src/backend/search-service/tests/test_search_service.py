"""
Comprehensive test suite for the SearchService class validating search operations,
data security, and performance requirements.

Dependencies:
pytest==7.0.0+
pytest-asyncio==0.18.0+
pytest-benchmark==3.4.0+
freezegun==1.2.0+
faker==8.0.0+
"""

import uuid
from datetime import datetime, timedelta
from typing import Dict

import pytest
from unittest.mock import Mock, patch
from freezegun import freeze_time
from faker import Faker

from ...src.services.search_service import SearchService
from ...src.models.search import (
    Search, SEARCH_STATUS_TYPES, ASSET_TYPES, 
    MAX_SEARCH_DURATION_DAYS, DATA_CLASSIFICATION_LEVELS
)

# Test constants
TEST_USER_ID = uuid.UUID('12345678-1234-5678-1234-567812345678')
PERFORMANCE_THRESHOLDS = {
    'search_creation': 0.5,  # seconds
    'search_retrieval': 0.2,
    'search_update': 0.3,
    'search_deletion': 0.2
}

# Initialize Faker for test data generation
fake = Faker()

@pytest.fixture
def valid_search_data() -> Dict:
    """Fixture providing valid search data for testing."""
    return {
        'parameters': {
            'temporal_window': {
                'start': datetime.utcnow().isoformat(),
                'end': (datetime.utcnow() + timedelta(days=30)).isoformat()
            },
            'assets': [{
                'type': 'environmental',
                'requirements': {
                    'resolution': 10,
                    'coverage': 80
                }
            }]
        },
        'classification_level': 'public',
        'locations': [{
            'type': 'polygon',
            'geometry': {
                'type': 'Polygon',
                'coordinates': [[
                    [-122.0, 37.0],
                    [-122.0, 38.0],
                    [-121.0, 38.0],
                    [-121.0, 37.0],
                    [-122.0, 37.0]
                ]]
            }
        }]
    }

@pytest.fixture
async def search_service():
    """Fixture providing configured SearchService instance with mocks."""
    # Mock database session
    db_session = Mock()
    db_session.add = Mock()
    db_session.commit = Mock()
    db_session.rollback = Mock()
    
    # Mock Redis client
    redis_client = Mock()
    redis_client.get = Mock(return_value=0)
    redis_client.pipeline = Mock(return_value=Mock(
        incr=Mock(),
        expire=Mock(),
        execute=Mock()
    ))
    
    service = SearchService(db_session, redis_client)
    return service

@pytest.mark.asyncio
class TestSearchService:
    """Comprehensive test suite for SearchService functionality."""

    async def test_create_search_valid(self, search_service, valid_search_data, benchmark):
        """Tests successful search creation with valid data."""
        async def create():
            return await search_service.create_search(TEST_USER_ID, valid_search_data)
        
        # Benchmark the creation
        result = benchmark(create)
        
        assert result is not None
        assert isinstance(result, Search)
        assert result.user_id == TEST_USER_ID
        assert result.parameters == valid_search_data['parameters']
        assert result.classification_level == valid_search_data['classification_level']
        assert len(result.locations) == 1
        
        # Verify database interactions
        search_service.db_session.add.assert_called_once()
        search_service.db_session.commit.assert_called_once()
        
        # Verify cache updates
        search_service.cache.pipeline().incr.assert_called_once()
        search_service.cache.pipeline().expire.assert_called_once()

    async def test_create_search_invalid_data(self, search_service):
        """Tests search creation with invalid data."""
        invalid_data = {
            'parameters': {},
            'classification_level': 'invalid'
        }
        
        with pytest.raises(ValueError) as exc_info:
            await search_service.create_search(TEST_USER_ID, invalid_data)
        
        assert 'Invalid search parameters' in str(exc_info.value)
        search_service.db_session.commit.assert_not_called()

    async def test_concurrent_search_limit(self, search_service, valid_search_data):
        """Tests enforcement of concurrent search limits."""
        # Mock Redis to simulate max concurrent searches
        search_service.cache.get.return_value = 10  # MAX_CONCURRENT_SEARCHES
        
        with pytest.raises(ValueError) as exc_info:
            await search_service.create_search(TEST_USER_ID, valid_search_data)
        
        assert 'Maximum concurrent searches' in str(exc_info.value)

    @pytest.mark.parametrize('classification_level', DATA_CLASSIFICATION_LEVELS)
    async def test_data_classification_validation(self, search_service, valid_search_data, classification_level):
        """Tests data classification validation for different security levels."""
        valid_search_data['classification_level'] = classification_level
        
        result = await search_service.create_search(TEST_USER_ID, valid_search_data)
        
        assert result.classification_level == classification_level
        assert result.parameters.get('classification_level') == classification_level

    async def test_search_performance(self, search_service, valid_search_data, benchmark):
        """Tests search operation performance against defined thresholds."""
        async def perform_operations():
            # Create search
            search = await search_service.create_search(TEST_USER_ID, valid_search_data)
            
            # Update search
            search.parameters['updated'] = True
            await search_service.update_search(search.id, search.parameters)
            
            # Retrieve search
            await search_service.get_search(search.id)
            
            # Delete search
            await search_service.delete_search(search.id)
        
        # Benchmark complete operation cycle
        result = benchmark(perform_operations)
        assert result < sum(PERFORMANCE_THRESHOLDS.values())

    @freeze_time("2024-01-01 12:00:00")
    async def test_search_temporal_validation(self, search_service, valid_search_data):
        """Tests temporal window validation in search parameters."""
        # Test future end date
        valid_search_data['parameters']['temporal_window']['end'] = (
            datetime.utcnow() + timedelta(days=MAX_SEARCH_DURATION_DAYS + 1)
        ).isoformat()
        
        with pytest.raises(ValueError) as exc_info:
            await search_service.create_search(TEST_USER_ID, valid_search_data)
        
        assert f'Search duration exceeds {MAX_SEARCH_DURATION_DAYS} days' in str(exc_info.value)

    @pytest.mark.parametrize('asset_type', ASSET_TYPES)
    async def test_asset_type_validation(self, search_service, valid_search_data, asset_type):
        """Tests validation of different asset types."""
        valid_search_data['parameters']['assets'][0]['type'] = asset_type
        
        result = await search_service.create_search(TEST_USER_ID, valid_search_data)
        
        assert result.parameters['assets'][0]['type'] == asset_type

    async def test_search_status_transitions(self, search_service, valid_search_data):
        """Tests valid search status transitions."""
        search = await search_service.create_search(TEST_USER_ID, valid_search_data)
        
        for status in ['submitted', 'processing', 'completed', 'archived']:
            result = await search_service.update_search_status(search.id, status)
            assert result.status == status

    async def test_rate_limiting(self, search_service, valid_search_data):
        """Tests rate limiting functionality."""
        # Mock Redis to simulate rate limit exceeded
        search_service.cache.get.return_value = 50  # MAX_REQUESTS_PER_WINDOW
        
        with pytest.raises(ValueError) as exc_info:
            await search_service.create_search(TEST_USER_ID, valid_search_data)
        
        assert 'Rate limit exceeded' in str(exc_info.value)

    async def test_error_handling(self, search_service, valid_search_data):
        """Tests error handling and logging."""
        # Mock database error
        search_service.db_session.commit.side_effect = Exception("Database error")
        
        with pytest.raises(ValueError) as exc_info:
            await search_service.create_search(TEST_USER_ID, valid_search_data)
        
        assert 'Database error' in str(exc_info.value)
        search_service.db_session.rollback.assert_called_once()