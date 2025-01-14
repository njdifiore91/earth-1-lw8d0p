"""
EARTH-n Satellite Collection Planning Service
Version: 1.0.0
Purpose: Provides interface for satellite collection planning through EARTH-n simulator integration.
"""

from typing import Dict, List, Any, Optional
import json
import httpx  # v0.24.0
from tenacity import retry, stop_after_attempt, wait_exponential  # v8.2.0

from ..config.earthn_config import EarthnConfig
from ..models.asset import Asset
from ..models.requirement import Requirement
from ..utils.calculation_utils import calculate_confidence_score

# Global constants
REQUEST_TIMEOUT: int = 30  # seconds
MAX_RETRIES: int = 3
RETRY_DELAY: int = 1  # seconds

class EarthnService:
    """
    Service class for interacting with EARTH-n satellite collection planning simulator.
    Handles API communication, request processing, and response handling with comprehensive
    error management and retry capabilities.
    """

    def __init__(self, config: EarthnConfig):
        """
        Initialize EARTH-n service with configuration.

        Args:
            config: EarthnConfig instance with API settings and credentials
        """
        self._config = config
        self._client = httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT,
            verify=True,
            follow_redirects=True
        )

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_DELAY)
    )
    async def submit_planning_request(
        self,
        asset: Asset,
        requirements: List[Requirement]
    ) -> Dict[str, Any]:
        """
        Submits a collection planning request to EARTH-n simulator.

        Args:
            asset: Asset instance with collection requirements
            requirements: List of Requirement instances

        Returns:
            Dict containing planning request ID and initial status

        Raises:
            httpx.RequestError: On network/connection errors
            httpx.HTTPStatusError: On HTTP error responses
            ValueError: On invalid input parameters
        """
        # Construct request payload
        payload = {
            "asset": asset.to_dict(),
            "requirements": [req.to_dict() for req in requirements],
            "optimization_parameters": {
                "max_windows": 10,
                "min_confidence": 0.6,
                "priority_weight": 1.0
            }
        }

        # Get API endpoint and headers
        endpoint = self._config.get_endpoints()["optimization"]
        headers = self._config.get_headers()

        try:
            # Submit planning request
            response = await self._client.post(
                endpoint,
                json=payload,
                headers=headers
            )
            response.raise_for_status()

            # Process response
            result = response.json()
            return {
                "request_id": result["request_id"],
                "status": result["status"],
                "estimated_completion": result.get("estimated_completion")
            }

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                # Handle rate limiting
                retry_after = int(e.response.headers.get("Retry-After", RETRY_DELAY))
                raise httpx.HTTPStatusError(
                    f"Rate limit exceeded. Retry after {retry_after} seconds",
                    request=e.request,
                    response=e.response
                )
            raise

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_DELAY)
    )
    async def get_planning_status(self, request_id: str) -> Dict[str, Any]:
        """
        Retrieves the status and results of a planning request.

        Args:
            request_id: Planning request identifier

        Returns:
            Dict containing status and planning results if available

        Raises:
            httpx.RequestError: On network/connection errors
            httpx.HTTPStatusError: On HTTP error responses
            ValueError: On invalid request ID
        """
        if not request_id:
            raise ValueError("Request ID is required")

        # Get API endpoint and headers
        endpoint = f"{self._config.get_endpoints()['status']}/{request_id}"
        headers = self._config.get_headers()

        try:
            # Get status
            response = await self._client.get(
                endpoint,
                headers=headers
            )
            response.raise_for_status()

            # Process response
            result = response.json()
            
            # If planning is complete, process results
            if result["status"] == "COMPLETED":
                result["results"] = self._process_planning_results(result["results"])

            return result

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                raise ValueError(f"Planning request {request_id} not found")
            raise

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=RETRY_DELAY)
    )
    async def cancel_planning_request(self, request_id: str) -> bool:
        """
        Cancels an in-progress planning request.

        Args:
            request_id: Planning request identifier

        Returns:
            bool indicating successful cancellation

        Raises:
            httpx.RequestError: On network/connection errors
            httpx.HTTPStatusError: On HTTP error responses
            ValueError: On invalid request ID
        """
        if not request_id:
            raise ValueError("Request ID is required")

        # Get API endpoint and headers
        endpoint = f"{self._config.get_endpoints()['cancel']}/{request_id}"
        headers = self._config.get_headers()

        try:
            # Submit cancellation request
            response = await self._client.delete(
                endpoint,
                headers=headers
            )
            response.raise_for_status()

            return response.status_code == 200

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                raise ValueError(f"Planning request {request_id} not found")
            raise

    def _process_planning_results(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """
        Processes and enriches planning results with confidence scores.

        Args:
            results: Raw planning results from EARTH-n

        Returns:
            Dict containing processed results with confidence scores
        """
        processed_results = results.copy()

        # Calculate confidence scores for each collection window
        for window in processed_results.get("collection_windows", []):
            parameters = {
                "temporal": window.get("temporal_score", 0.0),
                "spatial": window.get("spatial_score", 0.0),
                "spectral": window.get("spectral_score", 0.0),
                "radiometric": window.get("radiometric_score", 0.0)
            }
            window["confidence_score"] = calculate_confidence_score(parameters)

        # Sort windows by confidence score
        if "collection_windows" in processed_results:
            processed_results["collection_windows"].sort(
                key=lambda x: x["confidence_score"],
                reverse=True
            )

        # Calculate overall plan confidence score
        if processed_results.get("collection_windows"):
            processed_results["overall_confidence"] = sum(
                window["confidence_score"]
                for window in processed_results["collection_windows"]
            ) / len(processed_results["collection_windows"])
        else:
            processed_results["overall_confidence"] = 0.0

        return processed_results

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup."""
        await self._client.aclose()