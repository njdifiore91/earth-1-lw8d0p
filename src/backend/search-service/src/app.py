"""
FastAPI application entry point for the Matter satellite data search service.
Implements high-performance search capabilities with comprehensive security,
monitoring, and error handling features.

Dependencies:
fastapi==0.95.0+
uvicorn==0.21.0+
python-dotenv==1.0.0+
starlette==0.26.0+
prometheus-client==0.16.0+
structlog==23.1.0+
"""

import os
from typing import Dict

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from prometheus_client import Counter, Histogram, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import structlog
import uvicorn

from .config.database import DatabaseConfig
from .config.redis_config import RedisConfig
from .controllers.search_controller import search_router
from .controllers.location_controller import location_router

# Initialize structured logging
logger = structlog.get_logger()

# API versioning
API_VERSION = "v1"

# Debug mode from environment
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# Metrics
REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"]
)
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint"]
)

class RequestMiddleware(BaseHTTPMiddleware):
    """Custom middleware for request tracking and monitoring."""
    
    async def dispatch(self, request: Request, call_next):
        """Process each request with monitoring and logging."""
        # Start timing
        with REQUEST_LATENCY.labels(
            method=request.method,
            endpoint=request.url.path
        ).time():
            try:
                # Add request ID for tracing
                request.state.request_id = str(uuid.uuid4())
                
                # Process request
                response = await call_next(request)
                
                # Record metrics
                REQUEST_COUNT.labels(
                    method=request.method,
                    endpoint=request.url.path,
                    status=response.status_code
                ).inc()
                
                return response
                
            except Exception as e:
                logger.error(
                    "Request processing failed",
                    error=str(e),
                    request_id=request.state.request_id
                )
                return JSONResponse(
                    status_code=500,
                    content={"error": "Internal server error"}
                )

def create_app() -> FastAPI:
    """Creates and configures the FastAPI application instance."""
    
    # Initialize FastAPI with OpenAPI configuration
    app = FastAPI(
        title="Search Service",
        description="Matter satellite data search service API",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        debug=DEBUG
    )
    
    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"]
    )
    
    # Add security middleware
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=os.getenv("ALLOWED_HOSTS", "*").split(",")
    )
    
    # Add compression
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    
    # Add custom request middleware
    app.add_middleware(RequestMiddleware)
    
    # Register routers with version prefix
    app.include_router(
        search_router,
        prefix=f"/api/{API_VERSION}",
        tags=["searches"]
    )
    app.include_router(
        location_router,
        prefix=f"/api/{API_VERSION}",
        tags=["locations"]
    )
    
    # Metrics endpoint
    @app.get("/metrics")
    async def metrics():
        return Response(
            generate_latest(),
            media_type="text/plain"
        )
    
    # Health check endpoint
    @app.get("/health")
    async def health_check() -> Dict:
        """Comprehensive health check endpoint."""
        try:
            # Check database
            db = DatabaseConfig().get_engine()
            db_healthy = bool(db.execute("SELECT 1").scalar())
            
            # Check Redis
            redis = RedisConfig().get_client()
            redis_healthy = redis.ping()
            
            status = "healthy" if all([db_healthy, redis_healthy]) else "degraded"
            
            return {
                "status": status,
                "version": "1.0.0",
                "components": {
                    "database": "healthy" if db_healthy else "unhealthy",
                    "cache": "healthy" if redis_healthy else "unhealthy"
                }
            }
        except Exception as e:
            logger.error("Health check failed", error=str(e))
            return {
                "status": "unhealthy",
                "error": str(e)
            }
    
    return app

# Startup event handler
@app.on_event("startup")
async def startup_handler():
    """Handles application startup tasks."""
    try:
        # Initialize structured logging
        structlog.configure(
            processors=[
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.JSONRenderer()
            ]
        )
        
        # Initialize database
        db = DatabaseConfig()
        db.get_engine()
        logger.info("Database connection initialized")
        
        # Initialize Redis
        redis = RedisConfig()
        redis.get_client()
        logger.info("Redis connection initialized")
        
        logger.info("Application startup complete")
        
    except Exception as e:
        logger.error("Startup failed", error=str(e))
        raise

# Shutdown event handler
@app.on_event("shutdown")
async def shutdown_handler():
    """Handles graceful application shutdown."""
    try:
        # Close database connections
        db = DatabaseConfig()
        db.dispose_engine()
        logger.info("Database connections closed")
        
        # Close Redis connections
        redis = RedisConfig()
        redis.close_client()
        logger.info("Redis connections closed")
        
        logger.info("Application shutdown complete")
        
    except Exception as e:
        logger.error("Shutdown failed", error=str(e))
        raise

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler with detailed error reporting."""
    logger.error(
        "Unhandled exception",
        error=str(exc),
        request_id=getattr(request.state, "request_id", None)
    )
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "request_id": getattr(request.state, "request_id", None)
        }
    )

# Create application instance
app = create_app()

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        workers=int(os.getenv("WORKERS", 4)),
        log_level="info" if not DEBUG else "debug",
        reload=DEBUG
    )