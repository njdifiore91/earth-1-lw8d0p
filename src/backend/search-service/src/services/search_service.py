"""
Enhanced search service module implementing core search functionality for the satellite data product matching platform.
Provides robust search management with advanced monitoring, caching, and security features.

Dependencies:
sqlalchemy==2.0.0+
redis==4.5.0+
prometheus_client==0.16.0+
opentelemetry==1.15.0+
circuit-breaker-pattern==1.0.0+
"""

import logging
from datetime import datetime
from functools import wraps
from typing import Dict, List, Optional, Tuple
import uuid

from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from redis import Redis
from prometheus_client import Counter, Histogram
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
from circuit_breaker_pattern import CircuitBreaker

from ..models.search import Search, SEARCH_STATUS_TYPES, validate_search_parameters
from ..models.location import Location, validate_geometry

# Performance and security constants
CACHE_TTL = 3600  # Cache time-to-live in seconds
MAX_CONCURRENT_SEARCHES = 10
SEARCH_RESULT_LIMIT = 100
RATE_LIMIT_WINDOW = 300
MAX_REQUESTS_PER_WINDOW = 50
CIRCUIT_BREAKER_THRESHOLD = 0.5

# Monitoring metrics
search_requests = Counter('search_requests_total', 'Total search requests')
search_errors = Counter('search_errors_total', 'Total search errors')
search_duration = Histogram('search_duration_seconds', 'Search request duration')

# Initialize tracer
tracer = trace.get_tracer(__name__)

def rate_limit(func):
    """Rate limiting decorator with Redis backend."""
    @wraps(func)
    async def wrapper(self, *args, **kwargs):
        user_id = kwargs.get('user_id') or args[0]
        key = f"rate_limit:{user_id}"
        
        current = self.cache.get(key) or 0
        if int(current) >= MAX_REQUESTS_PER_WINDOW:
            raise ValueError("Rate limit exceeded")
            
        pipeline = self.cache.pipeline()
        pipeline.incr(key)
        pipeline.expire(key, RATE_LIMIT_WINDOW)
        pipeline.execute()
        
        return await func(self, *args, **kwargs)
    return wrapper

def validate_input(func):
    """Input validation decorator with logging."""
    @wraps(func)
    async def wrapper(self, *args, **kwargs):
        with tracer.start_as_current_span(func.__name__) as span:
            try:
                result = await func(self, *args, **kwargs)
                span.set_status(Status(StatusCode.OK))
                return result
            except Exception as e:
                span.set_status(Status(StatusCode.ERROR), str(e))
                logging.error(f"Validation error in {func.__name__}: {str(e)}")
                raise
    return wrapper

class SearchService:
    """Enhanced service class for managing satellite data search operations."""
    
    def __init__(self, db_session: Session, redis_client: Redis):
        """Initialize search service with monitoring and security features.
        
        Args:
            db_session: SQLAlchemy database session
            redis_client: Redis cache client
        """
        self.db_session = db_session
        self.cache = redis_client
        self.circuit_breaker = CircuitBreaker(
            failure_threshold=CIRCUIT_BREAKER_THRESHOLD,
            recovery_timeout=30,
            name="search_service"
        )
        
        # Initialize monitoring
        self._setup_monitoring()
    
    def _setup_monitoring(self):
        """Configure service monitoring and health checks."""
        self.health_status = {
            "status": "healthy",
            "last_check": datetime.utcnow(),
            "errors": []
        }
        
    @rate_limit
    @validate_input
    async def create_search(self, user_id: uuid.UUID, search_data: Dict) -> Search:
        """Creates a new search instance with enhanced validation and monitoring.
        
        Args:
            user_id: UUID of the requesting user
            search_data: Search parameters and configuration
            
        Returns:
            Created Search instance
            
        Raises:
            ValueError: If validation fails or limits exceeded
        """
        with tracer.start_as_current_span("create_search") as span:
            search_requests.inc()
            
            try:
                # Check concurrent search limit
                active_searches = self.cache.get(f"active_searches:{user_id}") or 0
                if int(active_searches) >= MAX_CONCURRENT_SEARCHES:
                    raise ValueError(f"Maximum concurrent searches ({MAX_CONCURRENT_SEARCHES}) exceeded")
                
                # Validate search parameters
                is_valid, error_msg = validate_search_parameters(
                    search_data.get('parameters', {}),
                    search_data.get('classification_level', 'public')
                )
                if not is_valid:
                    raise ValueError(f"Invalid search parameters: {error_msg}")
                
                # Create search instance
                search = Search(
                    user_id=user_id,
                    parameters=search_data['parameters'],
                    classification_level=search_data['classification_level']
                )
                
                # Process locations if provided
                if 'locations' in search_data:
                    locations = []
                    for loc_data in search_data['locations']:
                        if not validate_geometry(loc_data['geometry']):
                            raise ValueError(f"Invalid geometry for location")
                        
                        location = Location(
                            search_id=search.id,
                            type=loc_data['type'],
                            geometry=loc_data['geometry'],
                            metadata=loc_data.get('metadata')
                        )
                        locations.append(location)
                    
                    success, errors = search.bulk_add_locations(locations)
                    if not success:
                        raise ValueError(f"Location validation failed: {errors}")
                
                # Persist to database
                try:
                    self.db_session.add(search)
                    self.db_session.commit()
                except SQLAlchemyError as e:
                    self.db_session.rollback()
                    raise ValueError(f"Database error: {str(e)}")
                
                # Update cache
                pipeline = self.cache.pipeline()
                pipeline.incr(f"active_searches:{user_id}")
                pipeline.expire(f"active_searches:{user_id}", CACHE_TTL)
                pipeline.set(f"search:{search.id}", search.id, ex=CACHE_TTL)
                pipeline.execute()
                
                span.set_attribute("search_id", str(search.id))
                return search
                
            except Exception as e:
                search_errors.inc()
                span.set_status(Status(StatusCode.ERROR), str(e))
                logging.error(f"Search creation failed: {str(e)}")
                raise
    
    async def get_health_status(self) -> Dict:
        """Returns service health status with metrics.
        
        Returns:
            Dict containing health status and metrics
        """
        return {
            **self.health_status,
            "metrics": {
                "total_requests": search_requests._value.get(),
                "total_errors": search_errors._value.get(),
                "circuit_breaker_state": self.circuit_breaker.state,
                "cache_status": "healthy" if self.cache.ping() else "unhealthy"
            }
        }