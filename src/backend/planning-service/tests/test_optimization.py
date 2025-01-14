import pytest
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, AsyncMock, patch
from typing import Dict, Any

from ..src.services.optimization_service import OptimizationService
from ..src.models.collection_plan import CollectionPlan, CollectionWindow
from ..src.models.asset import Asset
from ..src.models.requirement import Requirement
from ..src.utils.calculation_utils import calculate_confidence_score

# Test constants
TEST_SEARCH_ID = "test-search-123"
TEST_ASSET_DATA = {
    "name": "test-satellite",
    "type": "ENVIRONMENTAL_MONITORING",
    "min_size": 1.0,
    "detection_limit": 0.5,
    "properties": {
        "resolution": 0.5,
        "spectral_bands": ["RGB", "NIR"],
        "revisit_time": 24
    }
}
TEST_REQUIREMENTS = [
    {
        "asset_id": "test-asset-id",
        "parameter": "SPATIAL",
        "value": 0.5,
        "unit": "meters",
        "start_time": datetime.now(timezone.utc),
        "end_time": datetime.now(timezone.utc) + timedelta(days=1),
        "constraints": {}
    }
]
PERFORMANCE_THRESHOLD = 3.0  # seconds, per SLA
MAX_MEMORY_USAGE = 512 * 1024 * 1024  # 512MB

@pytest.mark.usefixtures('benchmark')
class TestOptimizationService:
    """Comprehensive test class for OptimizationService with enterprise-grade validation"""

    def setup_method(self):
        """Comprehensive setup before each test"""
        # Initialize mock EARTH-n service
        self._earthn_mock = AsyncMock()
        self._earthn_mock.submit_planning_request = AsyncMock()
        self._earthn_mock.get_planning_status = AsyncMock()
        
        # Initialize service with mock
        self._service = OptimizationService(self._earthn_mock)
        
        # Prepare test data
        self._test_data = {
            'asset': Asset(**TEST_ASSET_DATA),
            'requirements': [Requirement(**req) for req in TEST_REQUIREMENTS],
            'plan': CollectionPlan(
                search_id=TEST_SEARCH_ID,
                asset=Asset(**TEST_ASSET_DATA),
                requirements=[Requirement(**req) for req in TEST_REQUIREMENTS],
                start_time=datetime.now(timezone.utc),
                end_time=datetime.now(timezone.utc) + timedelta(days=1),
                optimization_parameters={"max_windows": 5}
            )
        }

    def teardown_method(self):
        """Thorough cleanup after each test"""
        # Clear all mocks
        self._earthn_mock.reset_mock()
        
        # Clean up test data
        self._test_data = {}
        
        # Reset service state
        self._service = None
        
        # Force garbage collection
        import gc
        gc.collect()

    @pytest.mark.asyncio
    @pytest.mark.benchmark
    async def test_optimize_collection_plan_success(self, benchmark):
        """Tests successful optimization of a collection plan with performance validation"""
        # Configure mock responses
        request_id = "test-request-123"
        self._earthn_mock.submit_planning_request.return_value = {
            "request_id": request_id,
            "status": "PROCESSING"
        }
        
        collection_windows = [
            {
                "start_time": datetime.now(timezone.utc).isoformat(),
                "end_time": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
                "temporal_score": 0.9,
                "spatial_score": 0.8,
                "spectral_score": 0.7,
                "radiometric_score": 0.9
            }
        ]
        
        self._earthn_mock.get_planning_status.return_value = {
            "status": "COMPLETED",
            "results": {"collection_windows": collection_windows}
        }

        # Start performance timer
        start_time = asyncio.get_event_loop().time()

        # Execute optimization
        optimized_plan = await benchmark(
            self._service.optimize_collection_plan,
            self._test_data['plan']
        )

        # Validate performance
        execution_time = asyncio.get_event_loop().time() - start_time
        assert execution_time < PERFORMANCE_THRESHOLD, f"Optimization exceeded SLA threshold: {execution_time}s"

        # Validate optimization results
        assert optimized_plan.status == "OPTIMIZED"
        assert len(optimized_plan.collection_windows) > 0
        
        # Validate confidence scores
        for window in optimized_plan.collection_windows:
            assert 0 <= window.confidence_score <= 1
            assert isinstance(window, CollectionWindow)
            
        # Verify EARTH-n service calls
        assert self._earthn_mock.submit_planning_request.called
        assert self._earthn_mock.get_planning_status.called

    @pytest.mark.asyncio
    async def test_optimize_collection_plan_failure(self):
        """Tests comprehensive error handling and recovery scenarios"""
        # Configure mock for failure scenario
        self._earthn_mock.submit_planning_request.side_effect = RuntimeError("Simulation failed")

        # Test error handling
        with pytest.raises(RuntimeError):
            await self._service.optimize_collection_plan(self._test_data['plan'])

        # Verify plan status update
        assert self._test_data['plan'].status == "FAILED"

        # Test timeout scenario
        self._earthn_mock.submit_planning_request.side_effect = None
        self._earthn_mock.get_planning_status.return_value = {"status": "PROCESSING"}
        
        with pytest.raises(RuntimeError, match="Optimization timed out"):
            await self._service.optimize_collection_plan(self._test_data['plan'])

        # Test invalid results scenario
        self._earthn_mock.get_planning_status.return_value = {
            "status": "COMPLETED",
            "results": {"collection_windows": []}
        }
        
        with pytest.raises(ValueError, match="No valid collection windows"):
            await self._service.optimize_collection_plan(self._test_data['plan'])

    @pytest.mark.benchmark
    def test_process_optimization_results(self, benchmark):
        """Tests detailed processing and validation of optimization results"""
        # Prepare test results
        test_results = {
            "collection_windows": [
                {
                    "start_time": datetime.now(timezone.utc),
                    "end_time": datetime.now(timezone.utc) + timedelta(hours=1),
                    "temporal_score": 0.9,
                    "spatial_score": 0.8,
                    "spectral_score": 0.7,
                    "radiometric_score": 0.9
                }
            ]
        }

        # Execute and benchmark processing
        def process_results():
            asyncio.run(
                self._service.process_optimization_results(
                    test_results,
                    self._test_data['plan']
                )
            )

        benchmark(process_results)

        # Validate processed results
        assert self._test_data['plan'].status == "OPTIMIZED"
        assert len(self._test_data['plan'].collection_windows) > 0
        assert all(0 <= w.confidence_score <= 1 for w in self._test_data['plan'].collection_windows)

    def test_confidence_score_calculation(self):
        """Tests comprehensive confidence score calculation scenarios"""
        # Test standard case
        params = {
            "temporal": 0.9,
            "spatial": 0.8,
            "spectral": 0.7,
            "radiometric": 0.9
        }
        score = calculate_confidence_score(params)
        assert 0 <= score <= 1

        # Test boundary conditions
        max_params = {k: 1.0 for k in params}
        assert calculate_confidence_score(max_params) == 1.0

        min_params = {k: 0.0 for k in params}
        assert calculate_confidence_score(min_params) == 0.0

        # Test custom weights
        custom_weights = {
            "temporal": 0.5,
            "spatial": 0.2,
            "spectral": 0.2,
            "radiometric": 0.1
        }
        weighted_score = calculate_confidence_score(params, custom_weights)
        assert 0 <= weighted_score <= 1