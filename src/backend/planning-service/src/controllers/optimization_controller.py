"""
FastAPI controller for satellite data collection plan optimization.
Version: 1.0.0
"""

from fastapi import APIRouter, HTTPException, Request, status, Depends
from typing import Dict, Any, Optional
import asyncio
from prometheus_client import Counter, Histogram
import logging
from datetime import datetime, timezone

from ..services.optimization_service import OptimizationService
from ..models.collection_plan import CollectionPlan
from ..schemas.plan_schema import CollectionWindowSchema
from ..utils.auth import validate_auth_token
from ..utils.rate_limit import rate_limit
from ..utils.cache import cache, Cache

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize router with prefix and tags
router = APIRouter(prefix='/api/v1/optimization', tags=['optimization'])

# Constants
OPTIMIZATION_TIMEOUT = 300  # 5 minutes

# Metrics
OPTIMIZATION_METRICS = Counter(
    'optimization_requests_total',
    'Total optimization requests',
    ['status', 'asset_type']
)
OPTIMIZATION_DURATION = Histogram(
    'optimization_duration_seconds',
    'Time spent processing optimization requests',
    buckets=[1, 5, 10, 30, 60, 120, 300]
)
ERROR_METRICS = Counter(
    'optimization_errors_total',
    'Total optimization errors',
    ['error_type']
)

class OptimizationController:
    """
    Controller handling optimization endpoints with comprehensive error handling
    and monitoring capabilities.
    """

    def __init__(
        self,
        optimization_service: OptimizationService,
        cache_service: Cache
    ) -> None:
        """Initialize controller with required services."""
        self._optimization_service = optimization_service
        self._cache = cache_service
        self._active_optimizations: Dict[str, asyncio.Task] = {}

    async def handle_optimization_error(
        self,
        error: Exception,
        request_id: str
    ) -> None:
        """
        Enhanced error handler with detailed logging and metrics.
        """
        error_type = type(error).__name__
        ERROR_METRICS.labels(error_type=error_type).inc()
        
        logger.error(f"Optimization error for request {request_id}: {str(error)}")
        
        # Clean up any active optimization task
        if request_id in self._active_optimizations:
            self._active_optimizations[request_id].cancel()
            del self._active_optimizations[request_id]
            
        # Determine appropriate status code and error message
        if isinstance(error, asyncio.TimeoutError):
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Optimization request timed out"
            )
        elif isinstance(error, ValueError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error)
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Internal optimization error occurred"
            )

@router.post('/optimize')
@asyncio.timeout(OPTIMIZATION_TIMEOUT)
@validate_auth_token
@rate_limit(limit=10, window=60)
async def optimize_plan(
    plan: CollectionPlan,
    request: Request,
    optimization_controller: OptimizationController = Depends()
) -> Dict[str, Any]:
    """
    Endpoint to optimize a collection plan with enhanced monitoring.
    """
    start_time = datetime.now(timezone.utc)
    
    try:
        # Increment request counter
        OPTIMIZATION_METRICS.labels(
            status="started",
            asset_type=plan.asset.type
        ).inc()

        # Validate plan data
        plan.validate()

        # Submit optimization request
        optimized_plan = await optimization_controller._optimization_service.optimize_collection_plan(
            plan=plan
        )

        # Calculate and record duration
        duration = (datetime.now(timezone.utc) - start_time).total_seconds()
        OPTIMIZATION_DURATION.observe(duration)

        # Update success metrics
        OPTIMIZATION_METRICS.labels(
            status="completed",
            asset_type=plan.asset.type
        ).inc()

        return optimized_plan.to_dict()

    except Exception as e:
        await optimization_controller.handle_optimization_error(e, plan.id)

@router.get('/status/{plan_id}')
@validate_auth_token
@cache(ttl=5)
async def get_optimization_status(
    plan_id: str,
    request: Request,
    optimization_controller: OptimizationController = Depends()
) -> Dict[str, Any]:
    """
    Enhanced endpoint to check optimization status with detailed progress.
    """
    try:
        # Get optimization status
        status = await optimization_controller._optimization_service.get_optimization_progress(
            plan_id=plan_id
        )

        # Enrich status with additional metrics
        status.update({
            'request_time': datetime.now(timezone.utc).isoformat(),
            'resource_utilization': {
                'active_optimizations': len(optimization_controller._active_optimizations),
                'cache_size': optimization_controller._cache.size()
            }
        })

        return status

    except Exception as e:
        await optimization_controller.handle_optimization_error(e, plan_id)

@router.delete('/cancel/{plan_id}')
@validate_auth_token
async def cancel_optimization(
    plan_id: str,
    request: Request,
    optimization_controller: OptimizationController = Depends()
) -> Dict[str, str]:
    """
    Enhanced endpoint to cancel ongoing optimization with cleanup.
    """
    try:
        # Cancel optimization
        cancelled = await optimization_controller._optimization_service.cancel_optimization_task(
            plan_id=plan_id
        )

        if cancelled:
            # Clean up resources
            if plan_id in optimization_controller._active_optimizations:
                optimization_controller._active_optimizations[plan_id].cancel()
                del optimization_controller._active_optimizations[plan_id]

            # Clear cache entries
            optimization_controller._cache.delete(f"optimization_status:{plan_id}")

            return {
                "status": "cancelled",
                "message": "Optimization cancelled successfully",
                "cleanup_status": "completed"
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active optimization found for plan {plan_id}"
            )

    except Exception as e:
        await optimization_controller.handle_optimization_error(e, plan_id)