"""
FastAPI controller implementing REST endpoints for managing satellite data search operations.
Provides robust validation, error handling, and performance optimizations.

Dependencies:
fastapi==0.95.0+
pydantic==2.0.0+
"""

import logging
from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from ..services.search_service import SearchService
from ..schemas.search_schema import SearchSchema
from ..utils.auth import get_current_user
from ..utils.monitoring import monitor_endpoint
from ..utils.rate_limit import rate_limit
from ..utils.cache import cache_response

# Configure logging
logger = logging.getLogger(__name__)

# Initialize router with prefix
router = APIRouter(prefix="/api/v1", tags=["searches"])

# Constants
SEARCH_RESULT_LIMIT = 100
CACHE_TTL = 300  # 5 minutes cache for search results

@router.post("/searches", 
    response_model=Dict,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Search created successfully"},
        400: {"description": "Invalid request parameters"},
        401: {"description": "Authentication required"},
        429: {"description": "Rate limit exceeded"}
    })
@monitor_endpoint
@rate_limit(limit=10, window=60)  # 10 requests per minute
async def create_search_handler(
    search_data: SearchSchema,
    response: Response,
    current_user: Dict = Depends(get_current_user),
    search_service: SearchService = Depends()
) -> Dict:
    """
    Creates a new satellite data search with comprehensive validation.
    
    Args:
        search_data: Validated search request data
        response: FastAPI response object for header manipulation
        current_user: Authenticated user from dependency
        search_service: Injected search service instance
    
    Returns:
        Dict containing created search data with metadata
    
    Raises:
        HTTPException: For validation or processing errors
    """
    try:
        # Validate search data
        is_valid, errors = search_data.validate()
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": "Invalid search parameters", "errors": errors}
            )

        # Convert to model format
        model_data, warnings = search_data.to_model()
        
        # Create search
        search = await search_service.create_search(
            user_id=current_user["id"],
            search_data=model_data
        )
        
        # Set response headers
        response.headers["Location"] = f"/api/v1/searches/{search.id}"
        if warnings:
            response.headers["X-Search-Warnings"] = ",".join(warnings)
            
        return {
            "id": str(search.id),
            "status": search.status,
            "created_at": search.created_at.isoformat(),
            "metadata": {
                "asset_count": len(search_data.assets),
                "location_count": len(search_data.locations)
            }
        }
        
    except ValidationError as e:
        logger.error(f"Search validation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Validation error", "errors": e.errors()}
        )
    except Exception as e:
        logger.error(f"Search creation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "Failed to create search"}
        )

@router.get("/searches/{search_id}",
    response_model=Dict,
    responses={
        200: {"description": "Search details retrieved successfully"},
        404: {"description": "Search not found"},
        401: {"description": "Authentication required"}
    })
@monitor_endpoint
@cache_response(ttl=CACHE_TTL)
async def get_search_handler(
    search_id: UUID,
    current_user: Dict = Depends(get_current_user),
    search_service: SearchService = Depends()
) -> Dict:
    """
    Retrieves search details by ID with caching and access control.
    
    Args:
        search_id: Valid search identifier
        current_user: Authenticated user from dependency
        search_service: Injected search service instance
    
    Returns:
        Dict containing search details and metadata
    
    Raises:
        HTTPException: If search not found or access denied
    """
    try:
        search = await search_service.get_search(search_id)
        
        if not search:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Search not found"}
            )
            
        # Verify user has access
        if str(search.user_id) != str(current_user["id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Access denied"}
            )
            
        return {
            "id": str(search.id),
            "status": search.status,
            "parameters": search.parameters,
            "locations": [loc.to_dict() for loc in search.locations],
            "assets": search.assets,
            "created_at": search.created_at.isoformat(),
            "updated_at": search.updated_at.isoformat(),
            "metadata": {
                "duration_days": search.duration_days,
                "is_active": search.is_active
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to retrieve search {search_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "Failed to retrieve search"}
        )

@router.get("/searches",
    response_model=Dict,
    responses={
        200: {"description": "Searches retrieved successfully"},
        401: {"description": "Authentication required"}
    })
@monitor_endpoint
async def list_searches_handler(
    status: Optional[str] = Query(None, description="Filter by status"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(20, ge=1, le=SEARCH_RESULT_LIMIT, description="Results per page"),
    current_user: Dict = Depends(get_current_user),
    search_service: SearchService = Depends()
) -> Dict:
    """
    Lists user's searches with pagination and filtering.
    
    Args:
        status: Optional status filter
        offset: Pagination offset
        limit: Results per page
        current_user: Authenticated user from dependency
        search_service: Injected search service instance
    
    Returns:
        Dict containing paginated search results
    """
    try:
        searches, total = await search_service.list_user_searches(
            user_id=current_user["id"],
            status=status,
            offset=offset,
            limit=limit
        )
        
        return {
            "items": [
                {
                    "id": str(s.id),
                    "status": s.status,
                    "created_at": s.created_at.isoformat(),
                    "asset_count": len(s.assets)
                }
                for s in searches
            ],
            "metadata": {
                "total": total,
                "offset": offset,
                "limit": limit,
                "has_more": (offset + limit) < total
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to list searches: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "Failed to retrieve searches"}
        )

@router.patch("/searches/{search_id}",
    response_model=Dict,
    responses={
        200: {"description": "Search updated successfully"},
        404: {"description": "Search not found"},
        401: {"description": "Authentication required"}
    })
@monitor_endpoint
async def update_search_handler(
    search_id: UUID,
    update_data: Dict,
    current_user: Dict = Depends(get_current_user),
    search_service: SearchService = Depends()
) -> Dict:
    """
    Updates existing search with validation and access control.
    
    Args:
        search_id: Valid search identifier
        update_data: Search update parameters
        current_user: Authenticated user from dependency
        search_service: Injected search service instance
    
    Returns:
        Dict containing updated search data
    """
    try:
        # Verify search exists and user has access
        search = await search_service.get_search(search_id)
        if not search:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Search not found"}
            )
            
        if str(search.user_id) != str(current_user["id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Access denied"}
            )
            
        # Update search
        updated = await search_service.update_search(
            search_id=search_id,
            update_data=update_data
        )
        
        return {
            "id": str(updated.id),
            "status": updated.status,
            "updated_at": updated.updated_at.isoformat(),
            "metadata": {
                "version": updated.version
            }
        }
        
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Invalid update data", "errors": e.errors()}
        )
    except Exception as e:
        logger.error(f"Failed to update search {search_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "Failed to update search"}
        )

@router.delete("/searches/{search_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        204: {"description": "Search deleted successfully"},
        404: {"description": "Search not found"},
        401: {"description": "Authentication required"}
    })
@monitor_endpoint
async def delete_search_handler(
    search_id: UUID,
    current_user: Dict = Depends(get_current_user),
    search_service: SearchService = Depends()
) -> None:
    """
    Deletes search with access control and cleanup.
    
    Args:
        search_id: Valid search identifier
        current_user: Authenticated user from dependency
        search_service: Injected search service instance
    """
    try:
        # Verify search exists and user has access
        search = await search_service.get_search(search_id)
        if not search:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "Search not found"}
            )
            
        if str(search.user_id) != str(current_user["id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "Access denied"}
            )
            
        # Delete search
        await search_service.delete_search(search_id)
        
    except Exception as e:
        logger.error(f"Failed to delete search {search_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "Failed to delete search"}
        )