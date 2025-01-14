"""
Planning Service Module
Version: 1.0.0
Purpose: Core service for managing satellite data collection planning operations with enhanced 
performance, caching, and resilience features.
"""

import asyncio
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from tenacity import retry, stop_after_attempt, wait_exponential, CircuitBreaker  # v8.2.0
from prometheus_client import Counter, Histogram, Gauge  # v0.16.0

from ..models.collection_plan import CollectionPlan
from ..schemas.plan_schema import CollectionWindowSchema
from .optimization_service import OptimizationService
from .earthn_service import EarthnService
from ..models.asset import Asset
from ..models.requirement import Requirement

# Global constants
PLAN_CACHE_TTL: int = 3600  # Cache TTL in seconds
MAX_CONCURRENT_PLANS: int = 10  # Maximum concurrent plan operations
PLAN_UPDATE_INTERVAL: int = 5  # Status update interval in seconds
RETRY_MAX_ATTEMPTS: int = 3  # Maximum retry attempts
CIRCUIT_BREAKER_THRESHOLD: int = 5  # Failures before circuit breaks

# Prometheus metrics
PLAN_OPERATIONS = Counter(
    'planning_service_operations_total',
    'Total number of planning operations',
    ['operation_type']
)
PLAN_DURATION = Histogram(
    'planning_service_duration_seconds',
    'Duration of planning operations',
    ['operation_type']
)
CACHE_SIZE = Gauge(
    'planning_service_cache_size',
    'Current size of plan cache'
)
CONCURRENT_PLANS = Gauge(
    'planning_service_concurrent_plans',
    'Number of concurrent planning operations'
)

class PlanningService:
    """
    Enhanced service class for managing satellite data collection planning operations
    with resilience and monitoring capabilities.
    """

    def __init__(
        self,
        optimization_service: OptimizationService,
        earthn_service: EarthnService,
        config: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Initialize planning service with enhanced configuration and monitoring.

        Args:
            optimization_service: Optimization service instance
            earthn_service: EARTH-n service instance
            config: Optional service configuration
        """
        self._optimization_service = optimization_service
        self._earthn_service = earthn_service
        self._plan_cache: Dict[str, Tuple[CollectionPlan, float]] = {}
        self._concurrency_limiter = asyncio.Semaphore(MAX_CONCURRENT_PLANS)
        
        # Initialize circuit breaker
        self._circuit_breaker = CircuitBreaker(
            failure_threshold=CIRCUIT_BREAKER_THRESHOLD,
            recovery_timeout=60,
            expected_exception=Exception
        )

        # Initialize cache monitoring
        CACHE_SIZE.set_function(lambda: len(self._plan_cache))
        CONCURRENT_PLANS.set_function(
            lambda: MAX_CONCURRENT_PLANS - self._concurrency_limiter._value
        )

    @PLAN_DURATION.labels(operation_type='create').time()
    @retry(
        stop=stop_after_attempt(RETRY_MAX_ATTEMPTS),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def create_collection_plan(
        self,
        search_id: str,
        asset: Asset,
        requirements: List[Requirement],
        start_time: datetime,
        end_time: datetime,
        optimization_parameters: Optional[Dict[str, Any]] = None
    ) -> CollectionPlan:
        """
        Creates a new collection plan with enhanced validation and caching.

        Args:
            search_id: Unique search identifier
            asset: Asset instance
            requirements: List of requirements
            start_time: Plan start time
            end_time: Plan end time
            optimization_parameters: Optional optimization parameters

        Returns:
            CollectionPlan: Created and cached collection plan instance

        Raises:
            ValueError: If validation fails
            RuntimeError: If plan creation fails
        """
        PLAN_OPERATIONS.labels(operation_type='create').inc()

        try:
            # Acquire concurrency semaphore
            async with self._concurrency_limiter:
                # Create and validate plan
                plan = CollectionPlan(
                    search_id=search_id,
                    asset=asset,
                    requirements=requirements,
                    start_time=start_time,
                    end_time=end_time,
                    optimization_parameters=optimization_parameters or {}
                )
                plan.validate()

                # Add to cache with TTL
                cache_key = f"{search_id}:{asset.id}:{start_time.isoformat()}"
                self._plan_cache[cache_key] = (plan, asyncio.get_event_loop().time())

                return plan

        except Exception as e:
            PLAN_OPERATIONS.labels(operation_type='create_error').inc()
            raise RuntimeError(f"Failed to create collection plan: {str(e)}")

    @PLAN_DURATION.labels(operation_type='optimize').time()
    @retry(
        stop=stop_after_attempt(RETRY_MAX_ATTEMPTS),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def optimize_plan(self, plan_id: str) -> CollectionPlan:
        """
        Initiates optimization for a collection plan with resilience.

        Args:
            plan_id: Plan identifier

        Returns:
            CollectionPlan: Optimized collection plan

        Raises:
            ValueError: If plan not found
            RuntimeError: If optimization fails
        """
        PLAN_OPERATIONS.labels(operation_type='optimize').inc()

        try:
            # Check circuit breaker
            if not self._circuit_breaker.is_system_healthy():
                raise RuntimeError("Service circuit breaker is open")

            # Find plan in cache
            plan = None
            for cache_key, (cached_plan, timestamp) in self._plan_cache.items():
                if cached_plan.id == plan_id:
                    plan = cached_plan
                    break

            if not plan:
                raise ValueError(f"Plan {plan_id} not found in cache")

            # Update plan status
            plan.update_status('PROCESSING')

            # Submit for optimization
            optimized_plan = await self._optimization_service.optimize_collection_plan(
                plan,
                plan.optimization_parameters
            )

            # Update cache with optimized plan
            cache_key = f"{plan.search_id}:{plan.asset.id}:{plan.start_time.isoformat()}"
            self._plan_cache[cache_key] = (optimized_plan, asyncio.get_event_loop().time())

            return optimized_plan

        except Exception as e:
            PLAN_OPERATIONS.labels(operation_type='optimize_error').inc()
            raise RuntimeError(f"Failed to optimize plan: {str(e)}")

    async def _cleanup_cache(self) -> None:
        """Removes expired entries from plan cache."""
        current_time = asyncio.get_event_loop().time()
        expired_keys = [
            key for key, (_, timestamp) in self._plan_cache.items()
            if current_time - timestamp > PLAN_CACHE_TTL
        ]
        for key in expired_keys:
            del self._plan_cache[key]

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup."""
        await self._cleanup_cache()