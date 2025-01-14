"""
Optimization Service for satellite data collection planning.
Implements caching, retry mechanisms, and performance optimizations.
Version: 1.0.0
"""

import asyncio
from typing import Dict, List, Any, Optional
import numpy as np
from tenacity import retry, stop_after_attempt, wait_exponential
from cachetools import TTLCache
import logging

from ..models.collection_plan import CollectionPlan
from ..models.asset import Asset
from .earthn_service import EarthnService
from ..utils.calculation_utils import (
    calculate_confidence_score,
    optimize_time_windows,
    merge_overlapping_windows
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global constants
OPTIMIZATION_TIMEOUT: int = 300  # 5 minutes
MAX_OPTIMIZATION_ATTEMPTS: int = 3
MIN_ACCEPTABLE_SCORE: float = 0.6
CACHE_TTL: int = 3600  # 1 hour
BATCH_SIZE: int = 100
MAX_CONCURRENT_OPTIMIZATIONS: int = 10

class OptimizationService:
    """
    Service class for optimizing satellite data collection plans with caching 
    and retry mechanisms.
    """

    def __init__(
        self,
        earthn_service: EarthnService,
        cache_ttl: Optional[int] = None,
        max_concurrent: Optional[int] = None
    ) -> None:
        """
        Initialize optimization service with EARTH-n integration and caching.

        Args:
            earthn_service: EARTH-n simulator service instance
            cache_ttl: Optional cache TTL in seconds
            max_concurrent: Optional maximum concurrent optimizations
        """
        self._earthn_service = earthn_service
        self._optimization_cache = TTLCache(
            maxsize=1000,
            ttl=cache_ttl or CACHE_TTL
        )
        self._optimization_lock = asyncio.Lock()
        self._performance_metrics = {
            'total_optimizations': 0,
            'cache_hits': 0,
            'failed_attempts': 0,
            'average_duration': 0.0
        }
        self._max_concurrent = max_concurrent or MAX_CONCURRENT_OPTIMIZATIONS

    @retry(
        stop=stop_after_attempt(MAX_OPTIMIZATION_ATTEMPTS),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def optimize_collection_plan(
        self,
        plan: CollectionPlan,
        optimization_params: Optional[Dict[str, Any]] = None
    ) -> CollectionPlan:
        """
        Optimizes a collection plan using EARTH-n simulator with caching and retries.

        Args:
            plan: Collection plan to optimize
            optimization_params: Optional optimization parameters

        Returns:
            CollectionPlan: Optimized collection plan with confidence scores

        Raises:
            RuntimeError: If optimization fails after retries
            ValueError: If input validation fails
        """
        try:
            # Check cache first
            cache_key = f"{plan.id}:{plan.asset.id}:{plan.start_time.isoformat()}"
            if cache_key in self._optimization_cache:
                self._performance_metrics['cache_hits'] += 1
                cached_result = self._optimization_cache[cache_key]
                return CollectionPlan.from_dict(cached_result)

            # Acquire optimization lock if needed
            async with self._optimization_lock:
                if self._performance_metrics['total_optimizations'] >= self._max_concurrent:
                    await asyncio.sleep(1)  # Backoff if concurrent limit reached

                # Update plan status and metrics
                plan.update_status('PROCESSING')
                self._performance_metrics['total_optimizations'] += 1
                start_time = asyncio.get_event_loop().time()

                # Submit optimization request
                optimization_request = await self._earthn_service.submit_planning_request(
                    plan.asset,
                    plan.requirements
                )

                # Poll for results with timeout
                result = None
                timeout_time = start_time + OPTIMIZATION_TIMEOUT
                while asyncio.get_event_loop().time() < timeout_time:
                    status = await self._earthn_service.get_planning_status(
                        optimization_request['request_id']
                    )
                    if status['status'] == 'COMPLETED':
                        result = status['results']
                        break
                    elif status['status'] == 'FAILED':
                        raise RuntimeError(f"Optimization failed: {status.get('error')}")
                    await asyncio.sleep(2)

                if not result:
                    raise RuntimeError("Optimization timed out")

                # Process optimization results
                await self.process_optimization_results(result, plan)

                # Update performance metrics
                duration = asyncio.get_event_loop().time() - start_time
                self._performance_metrics['average_duration'] = (
                    (self._performance_metrics['average_duration'] * 
                     (self._performance_metrics['total_optimizations'] - 1) + duration) /
                    self._performance_metrics['total_optimizations']
                )

                # Cache successful result
                self._optimization_cache[cache_key] = plan.to_dict()

                return plan

        except Exception as e:
            self._performance_metrics['failed_attempts'] += 1
            logger.error(f"Optimization error: {str(e)}")
            plan.update_status('FAILED')
            raise

    async def process_optimization_results(
        self,
        results: Dict[str, Any],
        plan: CollectionPlan
    ) -> None:
        """
        Processes optimization results from EARTH-n with validation.

        Args:
            results: Optimization results from EARTH-n
            plan: Collection plan to update

        Raises:
            ValueError: If result validation fails
        """
        if not results.get('collection_windows'):
            raise ValueError("No valid collection windows in results")

        # Process and validate windows
        windows = results['collection_windows']
        validated_windows = []

        for window in windows:
            # Calculate window confidence score
            confidence_params = {
                'temporal': window.get('temporal_score', 0.0),
                'spatial': window.get('spatial_score', 0.0),
                'spectral': window.get('spectral_score', 0.0),
                'radiometric': window.get('radiometric_score', 0.0)
            }
            window['confidence_score'] = calculate_confidence_score(confidence_params)

            # Filter by minimum acceptable score
            if window['confidence_score'] >= MIN_ACCEPTABLE_SCORE:
                validated_windows.append(window)

        # Optimize window selection
        optimized_windows = optimize_time_windows(
            [w['start_time'] for w in validated_windows],
            plan.optimization_parameters
        )

        # Merge overlapping windows
        final_windows = merge_overlapping_windows(optimized_windows)

        # Update plan with optimized windows
        for window in final_windows:
            plan.add_collection_window(window)

        # Calculate overall plan confidence
        plan.confidence_score = self.calculate_plan_confidence(final_windows)
        plan.update_status('OPTIMIZED')

    def calculate_plan_confidence(
        self,
        windows: List[Dict[str, Any]],
        weights: Optional[Dict[str, float]] = None
    ) -> float:
        """
        Calculates overall plan confidence score with weighted factors.

        Args:
            windows: List of collection windows
            weights: Optional custom weight factors

        Returns:
            float: Overall confidence score between 0 and 1
        """
        if not windows:
            return 0.0

        # Default weights prioritize temporal and spatial factors
        default_weights = {
            'temporal': 0.4,
            'spatial': 0.3,
            'spectral': 0.2,
            'radiometric': 0.1
        }
        
        weights = weights or default_weights

        # Calculate weighted scores for each window
        window_scores = []
        for window in windows:
            params = {
                'temporal': window.get('temporal_score', 0.0),
                'spatial': window.get('spatial_score', 0.0),
                'spectral': window.get('spectral_score', 0.0),
                'radiometric': window.get('radiometric_score', 0.0)
            }
            window_scores.append(calculate_confidence_score(params, weights))

        # Calculate overall confidence score
        return float(np.mean(window_scores)) if window_scores else 0.0