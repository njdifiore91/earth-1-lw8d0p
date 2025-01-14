import pytest
import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from typing import Dict, Any

from ..src.services.planning_service import PlanningService
from ..src.services.optimization_service import OptimizationService
from ..src.services.earthn_service import EarthnService
from ..src.models.collection_plan import CollectionPlan, CollectionWindow
from ..src.models.asset import Asset
from ..src.models.requirement import Requirement

# Test data constants
TEST_SEARCH_ID = str(uuid4())
TEST_ASSET_DATA = {
    'name': 'Test Satellite',
    'type': 'ENVIRONMENTAL_MONITORING',
    'min_size': 1.0,
    'detection_limit': 0.5,
    'properties': {
        'resolution': 0.5,
        'spectral_bands': ['RGB', 'NIR'],
        'revisit_time': 24
    }
}
TEST_REQUIREMENT_DATA = {
    'parameter': 'SPATIAL',
    'value': 1.0,
    'unit': 'meters',
    'start_time': datetime.now(timezone.utc),
    'end_time': datetime.now(timezone.utc) + timedelta(days=1),
    'constraints': {}
}

@pytest.fixture
def mock_optimization_service(mocker):
    """Fixture for mocked optimization service"""
    service = mocker.Mock(spec=OptimizationService)
    service.optimize_collection_plan.return_value = mocker.AsyncMock()
    return service

@pytest.fixture
def mock_earthn_service(mocker):
    """Fixture for mocked EARTH-n service"""
    service = mocker.Mock(spec=EarthnService)
    service.submit_planning_request.return_value = mocker.AsyncMock()
    service.get_planning_status.return_value = mocker.AsyncMock()
    return service

@pytest.fixture
def mock_cache(mocker):
    """Fixture for mocked cache"""
    return mocker.Mock()

class TestPlanningService:
    """Test suite for PlanningService functionality"""

    @pytest.fixture(autouse=True)
    def setup_method(self, mock_optimization_service, mock_earthn_service):
        """Setup test fixtures before each test"""
        self.planning_service = PlanningService(
            optimization_service=mock_optimization_service,
            earthn_service=mock_earthn_service
        )
        self.test_data = {
            'search_id': TEST_SEARCH_ID,
            'asset': Asset(**TEST_ASSET_DATA),
            'requirements': [Requirement(**TEST_REQUIREMENT_DATA)],
            'start_time': datetime.now(timezone.utc),
            'end_time': datetime.now(timezone.utc) + timedelta(days=1)
        }
        self.performance_metrics = {
            'response_times': [],
            'memory_usage': [],
            'cache_hits': 0
        }

    @pytest.mark.asyncio
    @pytest.mark.timeout(5)
    async def test_create_collection_plan(self):
        """Test collection plan creation with validation and performance checks"""
        # Setup test data
        start_time = asyncio.get_event_loop().time()

        # Create collection plan
        plan = await self.planning_service.create_collection_plan(
            search_id=self.test_data['search_id'],
            asset=self.test_data['asset'],
            requirements=self.test_data['requirements'],
            start_time=self.test_data['start_time'],
            end_time=self.test_data['end_time']
        )

        # Verify response time
        response_time = asyncio.get_event_loop().time() - start_time
        assert response_time < 3.0, "Plan creation exceeded time limit"

        # Validate plan creation
        assert isinstance(plan, CollectionPlan)
        assert plan.search_id == self.test_data['search_id']
        assert plan.status == 'DRAFT'
        assert plan.asset.id == self.test_data['asset'].id
        assert len(plan.requirements) == len(self.test_data['requirements'])

        # Test invalid inputs
        with pytest.raises(ValueError):
            await self.planning_service.create_collection_plan(
                search_id="",
                asset=self.test_data['asset'],
                requirements=[],
                start_time=self.test_data['end_time'],
                end_time=self.test_data['start_time']
            )

    @pytest.mark.asyncio
    @pytest.mark.timeout(10)
    async def test_optimize_plan(self):
        """Test plan optimization workflow with EARTH-n integration"""
        # Create test plan
        plan = await self.planning_service.create_collection_plan(**self.test_data)

        # Configure mock responses
        self.planning_service._earthn_service.submit_planning_request.return_value = {
            'request_id': str(uuid4()),
            'status': 'PROCESSING'
        }
        self.planning_service._earthn_service.get_planning_status.return_value = {
            'status': 'COMPLETED',
            'results': {
                'collection_windows': [
                    {
                        'start_time': self.test_data['start_time'],
                        'end_time': self.test_data['start_time'] + timedelta(hours=1),
                        'confidence_score': 0.85,
                        'parameters': {}
                    }
                ]
            }
        }

        # Start optimization
        start_time = asyncio.get_event_loop().time()
        optimized_plan = await self.planning_service.optimize_plan(plan.id)

        # Verify response time
        response_time = asyncio.get_event_loop().time() - start_time
        assert response_time < 5.0, "Optimization exceeded time limit"

        # Validate optimization results
        assert optimized_plan.status == 'OPTIMIZED'
        assert len(optimized_plan.collection_windows) > 0
        assert all(isinstance(w, CollectionWindow) for w in optimized_plan.collection_windows)
        assert optimized_plan.confidence_score > 0.0

        # Test optimization failure
        self.planning_service._earthn_service.get_planning_status.return_value = {
            'status': 'FAILED',
            'error': 'Simulation error'
        }
        with pytest.raises(RuntimeError):
            await self.planning_service.optimize_plan(str(uuid4()))

    @pytest.mark.asyncio
    async def test_plan_status_management(self):
        """Test plan status transitions and validation"""
        plan = await self.planning_service.create_collection_plan(**self.test_data)
        
        # Test valid status transitions
        assert plan.status == 'DRAFT'
        plan.update_status('PROCESSING')
        assert plan.status == 'PROCESSING'
        
        # Test invalid status transitions
        with pytest.raises(ValueError):
            plan.update_status('INVALID_STATUS')
        with pytest.raises(ValueError):
            plan.update_status('DRAFT')  # Can't go back to DRAFT from PROCESSING

    @pytest.mark.asyncio
    async def test_concurrent_plan_handling(self):
        """Test handling of concurrent plan operations"""
        # Create multiple concurrent plans
        plans = []
        for _ in range(5):
            test_data = self.test_data.copy()
            test_data['search_id'] = str(uuid4())
            plans.append(self.planning_service.create_collection_plan(**test_data))

        # Execute concurrently
        results = await asyncio.gather(*plans)
        assert len(results) == 5
        assert all(isinstance(p, CollectionPlan) for p in results)

    @pytest.mark.asyncio
    async def test_cache_management(self):
        """Test plan cache functionality and cleanup"""
        # Create and cache plan
        plan = await self.planning_service.create_collection_plan(**self.test_data)
        cache_key = f"{plan.search_id}:{plan.asset.id}:{plan.start_time.isoformat()}"
        
        # Verify cache entry
        assert cache_key in self.planning_service._plan_cache
        cached_plan, _ = self.planning_service._plan_cache[cache_key]
        assert cached_plan.id == plan.id

        # Test cache cleanup
        await self.planning_service._cleanup_cache()
        assert len(self.planning_service._plan_cache) > 0  # Recent entry should remain

    def teardown_method(self):
        """Cleanup after each test"""
        self.performance_metrics['response_times'].clear()
        self.performance_metrics['memory_usage'].clear()
        self.performance_metrics['cache_hits'] = 0