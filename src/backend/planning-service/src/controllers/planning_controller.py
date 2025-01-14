"""
Planning Controller Module
Version: 1.0.0
Purpose: FastAPI controller handling HTTP endpoints for satellite data collection planning operations
with enhanced production features including caching, rate limiting, circuit breakers, and monitoring.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
from cachetools import TTLCache
from prometheus_client import Counter, Histogram, Gauge
from tenacity import retry, stop_after_attempt, wait_exponential, CircuitBreaker
import logging
from functools import wraps

from ..services.planning_service import PlanningService
from ..schemas.plan_schema import CollectionPlanSchema, AssetSchema
from ..models.collection_plan import CollectionPlan
from ..models.asset import Asset
from ..models.requirement import Requirement

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize router with prefix and tags
router = APIRouter(prefix='/api/v1/plans', tags=['plans'])

# Initialize services
planning_service = PlanningService()

# Initialize metrics
REQUEST_COUNTER = Counter(
    'planning_requests_total',
    'Total planning requests',
    ['endpoint', 'status']
)
RESPONSE_TIME = Histogram(
    'planning_response_time_seconds',
    'Response time in seconds',
    ['endpoint']
)
ACTIVE_REQUESTS = Gauge(
    'planning_active_requests',
    'Number of active planning requests'
)

# Initialize cache
PLAN_CACHE = TTLCache(maxsize=1000, ttl=300)  # 5 minutes TTL

# Initialize circuit breaker
CIRCUIT_BREAKER = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60,
    expected_exception=Exception
)

def rate_limit(max_requests: int = 100, window_seconds: int = 60):
    """Rate limiting decorator"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request = kwargs.get('request')
            if request:
                client_id = request.client.host
                current_time = datetime.now(timezone.utc)
                
                # Implement rate limiting logic here
                # This is a simplified version - in production use Redis
                if PLAN_CACHE.get(f"rate_limit:{client_id}"):
                    raise HTTPException(
                        status_code=429,
                        detail="Rate limit exceeded"
                    )
                
                PLAN_CACHE[f"rate_limit:{client_id}"] = current_time
                return await func(*args, **kwargs)
        return wrapper
    return decorator

def monitor_performance(func):
    """Performance monitoring decorator"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        endpoint = func.__name__
        REQUEST_COUNTER.labels(endpoint=endpoint, status="started").inc()
        ACTIVE_REQUESTS.inc()
        
        try:
            with RESPONSE_TIME.labels(endpoint=endpoint).time():
                result = await func(*args, **kwargs)
            REQUEST_COUNTER.labels(endpoint=endpoint, status="success").inc()
            return result
        except Exception as e:
            REQUEST_COUNTER.labels(endpoint=endpoint, status="error").inc()
            raise
        finally:
            ACTIVE_REQUESTS.dec()
    return wrapper

@router.post('/', response_model=CollectionPlanSchema, status_code=201)
@rate_limit(max_requests=100, window_seconds=60)
@monitor_performance
async def create_plan(
    request: Request,
    plan_data: Dict[str, Any],
    background_tasks: BackgroundTasks
) -> Dict[str, Any]:
    """
    Creates a new collection plan with enhanced validation and monitoring.
    """
    try:
        # Validate request data
        CollectionPlanSchema(**plan_data)
        
        # Create plan using circuit breaker
        plan = await CIRCUIT_BREAKER(
            planning_service.create_collection_plan
        )(
            search_id=plan_data['search_id'],
            asset=Asset.from_dict(plan_data['asset']),
            requirements=[
                Requirement.from_dict(req) for req in plan_data['requirements']
            ],
            start_time=datetime.fromisoformat(plan_data['start_time']),
            end_time=datetime.fromisoformat(plan_data['end_time']),
            optimization_parameters=plan_data.get('optimization_parameters', {})
        )
        
        # Cache plan data
        cache_key = f"plan:{plan.id}"
        PLAN_CACHE[cache_key] = plan.to_dict()
        
        # Schedule optimization in background
        background_tasks.add_task(
            planning_service.optimize_plan,
            plan.id
        )
        
        return plan.to_dict()
        
    except Exception as e:
        logger.error(f"Error creating plan: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create plan: {str(e)}"
        )

@router.get('/{plan_id}', response_model=CollectionPlanSchema)
@monitor_performance
async def get_plan(plan_id: str) -> Dict[str, Any]:
    """
    Retrieves a collection plan by ID with caching.
    """
    try:
        # Check cache first
        cache_key = f"plan:{plan_id}"
        if cache_key in PLAN_CACHE:
            return PLAN_CACHE[cache_key]
        
        # Get plan from service with circuit breaker
        plan = await CIRCUIT_BREAKER(
            planning_service.get_collection_plan
        )(plan_id)
        
        if not plan:
            raise HTTPException(
                status_code=404,
                detail=f"Plan {plan_id} not found"
            )
        
        # Cache plan data
        PLAN_CACHE[cache_key] = plan.to_dict()
        
        return plan.to_dict()
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving plan: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve plan: {str(e)}"
        )

@router.put('/{plan_id}', response_model=CollectionPlanSchema)
@rate_limit(max_requests=100, window_seconds=60)
@monitor_performance
async def update_plan(
    plan_id: str,
    plan_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Updates an existing collection plan with validation.
    """
    try:
        # Validate request data
        CollectionPlanSchema(**plan_data)
        
        # Update plan using circuit breaker
        plan = await CIRCUIT_BREAKER(
            planning_service.update_plan
        )(plan_id, plan_data)
        
        if not plan:
            raise HTTPException(
                status_code=404,
                detail=f"Plan {plan_id} not found"
            )
        
        # Update cache
        cache_key = f"plan:{plan_id}"
        PLAN_CACHE[cache_key] = plan.to_dict()
        
        return plan.to_dict()
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating plan: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update plan: {str(e)}"
        )

@router.delete('/{plan_id}', status_code=204)
@monitor_performance
async def delete_plan(plan_id: str) -> None:
    """
    Deletes a collection plan with cache invalidation.
    """
    try:
        # Delete plan using circuit breaker
        await CIRCUIT_BREAKER(
            planning_service.delete_plan
        )(plan_id)
        
        # Invalidate cache
        cache_key = f"plan:{plan_id}"
        if cache_key in PLAN_CACHE:
            del PLAN_CACHE[cache_key]
            
    except Exception as e:
        logger.error(f"Error deleting plan: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete plan: {str(e)}"
        )

@router.get('/{plan_id}/status', response_model=Dict[str, Any])
@monitor_performance
async def get_plan_status(plan_id: str) -> Dict[str, Any]:
    """
    Retrieves the current status of a collection plan.
    """
    try:
        # Get status using circuit breaker
        status = await CIRCUIT_BREAKER(
            planning_service.get_plan_status
        )(plan_id)
        
        if not status:
            raise HTTPException(
                status_code=404,
                detail=f"Plan {plan_id} not found"
            )
            
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving plan status: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve plan status: {str(e)}"
        )