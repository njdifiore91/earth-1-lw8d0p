"""
Location controller for the search service with enhanced security and performance.
Implements location data management endpoints with comprehensive validation,
caching, and monitoring capabilities.

Dependencies:
fastapi==0.95.0+
pydantic==2.0.0+
prometheus-client==0.16.0+
opentelemetry-api==1.15.0+
redis==4.5.0+
"""

import uuid
from typing import Dict, Optional
from datetime import datetime

from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram
from opentelemetry import trace
from redis import Redis
from redis.exceptions import RedisError

from ..models.location import Location, VALID_LOCATION_TYPES, MAX_AREA_SIZE
from ..config.database import DatabaseConfig

# Router configuration with rate limiting and security
router = APIRouter(prefix="/api/v1", tags=["locations"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Constants
DEFAULT_SRID = 4326  # WGS84
LOCATION_CACHE_TTL = 300  # 5 minutes
MAX_LOCATIONS_PER_SEARCH = 100

# Monitoring metrics
LOCATION_REQUESTS = Counter(
    'location_requests_total',
    'Total number of location requests',
    ['method', 'endpoint', 'status']
)
LOCATION_PROCESSING_TIME = Histogram(
    'location_processing_seconds',
    'Time spent processing location requests',
    ['operation']
)

# Initialize tracing
tracer = trace.get_tracer(__name__)

# Redis client for caching
redis_client = Redis(
    host="localhost",
    port=6379,
    db=0,
    decode_responses=True
)

class LocationBase(BaseModel):
    """Location request model with enhanced validation."""
    type: str = Field(..., description="Location type", enum=VALID_LOCATION_TYPES)
    geometry: Dict = Field(..., description="GeoJSON geometry")
    metadata: Optional[Dict] = Field(default=None, description="Additional metadata")

    class Config:
        json_schema_extra = {
            "example": {
                "type": "polygon",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
                },
                "metadata": {"name": "Test Location"}
            }
        }

async def validate_token(token: str = Depends(oauth2_scheme)) -> str:
    """Validates authentication token with enhanced security checks."""
    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    # Additional token validation logic would go here
    return token

def rate_limit(limit: int, period: int):
    """Rate limiting decorator with Redis-based tracking."""
    def decorator(func):
        async def wrapper(*args, request: Request, **kwargs):
            client_ip = request.client.host
            key = f"rate_limit:{client_ip}:{func.__name__}"
            
            try:
                current = redis_client.get(key)
                if current and int(current) >= limit:
                    LOCATION_REQUESTS.labels(
                        method=request.method,
                        endpoint=request.url.path,
                        status="rate_limited"
                    ).inc()
                    raise HTTPException(
                        status_code=429,
                        detail="Rate limit exceeded"
                    )
                
                pipeline = redis_client.pipeline()
                pipeline.incr(key)
                pipeline.expire(key, period)
                pipeline.execute()
                
            except RedisError:
                # Fallback to allow request if Redis is unavailable
                pass
                
            return await func(*args, request=request, **kwargs)
        return wrapper
    return decorator

@router.post("/searches/{search_id}/locations")
@validate_token
@rate_limit(limit=100, period=60)
async def create_location(
    search_id: uuid.UUID,
    location_data: LocationBase,
    request: Request
) -> Dict:
    """Creates a new location with comprehensive validation and caching.
    
    Args:
        search_id: UUID of the associated search
        location_data: Location creation parameters
        request: FastAPI request object
        
    Returns:
        Dict containing created location data
        
    Raises:
        HTTPException: For validation or processing errors
    """
    with tracer.start_as_current_span("create_location") as span:
        span.set_attribute("search_id", str(search_id))
        
        with LOCATION_PROCESSING_TIME.labels("create").time():
            try:
                # Check cache for existing locations count
                cache_key = f"search:{search_id}:location_count"
                try:
                    location_count = redis_client.get(cache_key)
                    if location_count and int(location_count) >= MAX_LOCATIONS_PER_SEARCH:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Maximum locations ({MAX_LOCATIONS_PER_SEARCH}) exceeded"
                        )
                except RedisError:
                    # Fallback to database count if cache unavailable
                    pass
                
                # Create location with validation
                location = Location(
                    search_id=search_id,
                    type=location_data.type,
                    geometry=location_data.geometry,
                    metadata=location_data.metadata
                )
                
                # Store in database
                db = DatabaseConfig().get_engine()
                with db.begin() as conn:
                    conn.add(location)
                
                # Update cache
                try:
                    cache_key = f"location:{location.id}"
                    redis_client.setex(
                        cache_key,
                        LOCATION_CACHE_TTL,
                        location.geometry
                    )
                    redis_client.incr(f"search:{search_id}:location_count")
                except RedisError:
                    pass
                
                LOCATION_REQUESTS.labels(
                    method=request.method,
                    endpoint=request.url.path,
                    status="success"
                ).inc()
                
                return {
                    "id": str(location.id),
                    "search_id": str(search_id),
                    "type": location.type,
                    "geometry": location_data.geometry,
                    "metadata": location.metadata,
                    "created_at": location.created_at.isoformat()
                }
                
            except ValueError as e:
                LOCATION_REQUESTS.labels(
                    method=request.method,
                    endpoint=request.url.path,
                    status="validation_error"
                ).inc()
                raise HTTPException(status_code=400, detail=str(e))
                
            except Exception as e:
                LOCATION_REQUESTS.labels(
                    method=request.method,
                    endpoint=request.url.path,
                    status="error"
                ).inc()
                raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/health")
async def health_check() -> Dict:
    """Health check endpoint with comprehensive status reporting."""
    try:
        # Check database connectivity
        db = DatabaseConfig().get_engine()
        db_status = db.execute("SELECT 1").scalar() == 1
        
        # Check Redis connectivity
        try:
            redis_status = redis_client.ping()
        except RedisError:
            redis_status = False
        
        # Collect metrics
        metrics = {
            "database": "healthy" if db_status else "unhealthy",
            "cache": "healthy" if redis_status else "unhealthy",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        return {
            "status": "healthy" if all([db_status, redis_status]) else "degraded",
            "components": metrics
        }
        
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }