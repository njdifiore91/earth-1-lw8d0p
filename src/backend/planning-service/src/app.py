"""
FastAPI Application Entry Point
Version: 1.0.0
Purpose: Main application configuration and startup for the planning service
with comprehensive production features.
"""

import logging
import os
from typing import Dict, Any
import sentry_sdk
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
import structlog
import uvicorn
from contextlib import asynccontextmanager

from .config.earthn_config import EarthnConfig
from .config.redis_config import RedisConfig
from .controllers.planning_controller import router as planning_router
from .controllers.optimization_controller import router as optimization_router

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    wrapper_class=structlog.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Initialize Sentry for error tracking
sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment=os.getenv("ENVIRONMENT", "production"),
    traces_sample_rate=0.1,
)

# Initialize configurations
earthn_config = EarthnConfig(validate_on_startup=True)
redis_config = RedisConfig()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager for FastAPI application with comprehensive startup
    and shutdown procedures.
    """
    # Startup
    try:
        # Initialize Redis connection
        redis_client = redis_config.get_client()
        app.state.redis = redis_client
        
        # Validate EARTH-n configuration
        earthn_config.validate()
        app.state.earthn = earthn_config
        
        # Initialize Prometheus metrics
        Instrumentator().instrument(app).expose(app)
        
        logger.info("Application startup completed successfully")
        yield
        
    except Exception as e:
        logger.error(f"Startup error: {str(e)}")
        raise
    
    finally:
        # Shutdown
        try:
            # Close Redis connections
            if hasattr(app.state, "redis"):
                redis_config.close_client()
            
            logger.info("Application shutdown completed successfully")
        except Exception as e:
            logger.error(f"Shutdown error: {str(e)}")

# Initialize FastAPI application
app = FastAPI(
    title="Planning Service",
    version="1.0.0",
    description="Satellite data collection planning service",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

def configure_middleware() -> None:
    """Configure application middleware with security and performance features."""
    
    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"]
    )
    
    # Compression middleware
    app.add_middleware(
        GZipMiddleware,
        minimum_size=1000
    )
    
    # Request ID middleware
    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
    
    # Security headers middleware
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response

def configure_routes() -> None:
    """Configure API routes with versioning and documentation."""
    
    # Include routers
    app.include_router(
        planning_router,
        prefix="/api/v1/plans",
        tags=["plans"]
    )
    app.include_router(
        optimization_router,
        prefix="/api/v1/optimization",
        tags=["optimization"]
    )
    
    # Health check endpoint
    @app.get("/health")
    async def health_check() -> Dict[str, Any]:
        """Enhanced health check with component status."""
        try:
            # Check Redis connection
            await app.state.redis.ping()
            redis_status = "healthy"
        except Exception:
            redis_status = "unhealthy"
            
        # Check EARTH-n configuration
        earthn_status = "healthy" if earthn_config.validate() else "unhealthy"
        
        return {
            "status": "healthy",
            "components": {
                "redis": redis_status,
                "earthn": earthn_status
            },
            "version": app.version
        }

# Configure error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Global exception handler with logging and monitoring."""
    error_id = str(uuid.uuid4())
    
    # Log error with context
    logger.error(
        "Unhandled exception",
        error_id=error_id,
        error_type=type(exc).__name__,
        error_message=str(exc),
        path=request.url.path,
        method=request.method,
        request_id=getattr(request.state, "request_id", None)
    )
    
    # Track in Sentry
    sentry_sdk.capture_exception(exc)
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "error_id": error_id,
            "message": "An unexpected error occurred"
        }
    )

# Configure application
configure_middleware()
configure_routes()

if __name__ == "__main__":
    # Load environment configuration
    port = int(os.getenv("PORT", 8000))
    workers = int(os.getenv("WORKERS", 4))
    
    # Start server with production configuration
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=port,
        workers=workers,
        log_level="info",
        proxy_headers=True,
        forwarded_allow_ips="*",
        ssl_keyfile=os.getenv("SSL_KEYFILE"),
        ssl_certfile=os.getenv("SSL_CERTFILE")
    )