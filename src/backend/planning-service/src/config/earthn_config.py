"""
EARTH-n Simulator Configuration Module
Version: 1.0.0
Purpose: Manages secure configuration and integration settings for EARTH-n satellite collection planning simulator.
"""

import os
import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from urllib.parse import urlparse, urljoin

# Version 3.11+ required for all imports
import os  # stdlib
import typing  # stdlib
import dataclasses  # stdlib
import urllib.parse  # stdlib
import logging  # stdlib

# Global Constants
EARTHN_API_VERSION: str = 'v1'
EARTHN_REQUEST_TIMEOUT: int = 30  # seconds
EARTHN_MAX_RETRIES: int = 3
EARTHN_DEFAULT_HEADERS: Dict[str, str] = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-API-Version': EARTHN_API_VERSION,
    'User-Agent': 'Matter-Planning-Service/1.0'
}
EARTHN_REQUIRED_ENV_VARS: List[str] = ['EARTHN_BASE_URL', 'EARTHN_API_KEY']

# Configure logging
logger = logging.getLogger(__name__)

class ConfigurationError(Exception):
    """Custom exception for configuration-related errors."""
    pass

@dataclass
class EarthnConfig:
    """
    EARTH-n simulator API configuration with comprehensive security and validation.
    Manages API endpoints, authentication, and connection settings with best practices.
    """
    base_url: str
    api_key: str
    timeout: int
    endpoints: Dict[str, str]
    retry_config: Dict[str, Any]
    rate_limits: Dict[str, Any]
    is_initialized: bool = False

    def __init__(
        self,
        custom_timeout: Optional[int] = None,
        retry_config: Optional[Dict[str, Any]] = None,
        rate_limits: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Initialize EARTH-n configuration with secure defaults and validation.
        
        Args:
            custom_timeout: Optional custom timeout value in seconds
            retry_config: Optional custom retry configuration
            rate_limits: Optional custom rate limiting parameters
        
        Raises:
            ConfigurationError: If configuration validation fails
        """
        # Validate environment variables
        self._validate_environment()
        
        # Initialize base configuration
        self.base_url = self._validate_base_url(os.environ['EARTHN_BASE_URL'])
        self.api_key = self._validate_api_key(os.environ['EARTHN_API_KEY'])
        self.timeout = custom_timeout or EARTHN_REQUEST_TIMEOUT
        
        # Initialize retry configuration
        self.retry_config = retry_config or {
            'max_retries': EARTHN_MAX_RETRIES,
            'backoff_factor': 0.5,
            'status_forcelist': [500, 502, 503, 504],
            'allowed_methods': ['HEAD', 'GET', 'POST'],
            'respect_retry_after_header': True
        }
        
        # Initialize rate limits
        self.rate_limits = rate_limits or {
            'requests_per_second': 10,
            'burst_limit': 20,
            'timeout_window': 60
        }
        
        # Initialize endpoints
        self.endpoints = self.get_endpoints()
        
        # Validate complete configuration
        self.validate()
        self.is_initialized = True
        
        logger.info("EARTH-n configuration initialized successfully")

    def get_headers(self, additional_headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        """
        Generate secure HTTP headers for EARTH-n API requests.
        
        Args:
            additional_headers: Optional additional headers to include
            
        Returns:
            Dict[str, str]: Complete set of headers including authentication
        """
        headers = EARTHN_DEFAULT_HEADERS.copy()
        
        # Add authentication
        headers['Authorization'] = f'Bearer {self.api_key}'
        
        # Add security headers
        headers.update({
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block'
        })
        
        # Add additional headers if provided
        if additional_headers:
            headers.update(additional_headers)
            
        return headers

    def get_endpoints(self) -> Dict[str, str]:
        """
        Generate versioned API endpoint URLs.
        
        Returns:
            Dict[str, str]: Dictionary of API endpoints
        """
        base_api_path = urljoin(self.base_url, f'/api/{EARTHN_API_VERSION}')
        
        endpoints = {
            'optimization': f'{base_api_path}/optimize',
            'status': f'{base_api_path}/status',
            'cancel': f'{base_api_path}/cancel',
            'health': f'{base_api_path}/health',
            'capabilities': f'{base_api_path}/capabilities',
            'validate': f'{base_api_path}/validate'
        }
        
        # Validate all endpoints
        for endpoint in endpoints.values():
            self._validate_endpoint_url(endpoint)
            
        return endpoints

    def validate(self) -> bool:
        """
        Perform comprehensive configuration validation.
        
        Returns:
            bool: True if configuration is valid
            
        Raises:
            ConfigurationError: If validation fails
        """
        try:
            # Validate base URL
            if not self.base_url.startswith('https://'):
                raise ConfigurationError("EARTH-n base URL must use HTTPS")
                
            # Validate API key format
            if not self.api_key or len(self.api_key) < 32:
                raise ConfigurationError("Invalid API key format")
                
            # Validate timeout
            if not isinstance(self.timeout, int) or self.timeout < 1:
                raise ConfigurationError("Invalid timeout value")
                
            # Validate retry configuration
            if not isinstance(self.retry_config, dict):
                raise ConfigurationError("Invalid retry configuration")
                
            # Validate rate limits
            if not all(k in self.rate_limits for k in ['requests_per_second', 'burst_limit']):
                raise ConfigurationError("Invalid rate limit configuration")
                
            # Validate endpoints
            if not all(self.endpoints.values()):
                raise ConfigurationError("Invalid endpoint configuration")
                
            return True
            
        except Exception as e:
            logger.error(f"Configuration validation failed: {str(e)}")
            raise ConfigurationError(f"Configuration validation failed: {str(e)}")

    def get_retry_config(self) -> Dict[str, Any]:
        """
        Get retry configuration for API requests.
        
        Returns:
            Dict[str, Any]: Retry configuration including backoff strategy
        """
        return {
            'max_retries': self.retry_config['max_retries'],
            'backoff_factor': self.retry_config['backoff_factor'],
            'status_forcelist': self.retry_config['status_forcelist'],
            'allowed_methods': self.retry_config['allowed_methods'],
            'respect_retry_after_header': self.retry_config['respect_retry_after_header'],
            'timeout': self.timeout
        }

    def _validate_environment(self) -> None:
        """Validate required environment variables are present."""
        missing_vars = [var for var in EARTHN_REQUIRED_ENV_VARS if not os.environ.get(var)]
        if missing_vars:
            raise ConfigurationError(f"Missing required environment variables: {', '.join(missing_vars)}")

    def _validate_base_url(self, url: str) -> str:
        """Validate base URL format and accessibility."""
        try:
            result = urlparse(url)
            if not all([result.scheme == 'https', result.netloc]):
                raise ConfigurationError("Invalid base URL format")
            return url.rstrip('/')
        except Exception as e:
            raise ConfigurationError(f"Invalid base URL: {str(e)}")

    def _validate_api_key(self, api_key: str) -> str:
        """Validate API key format and security requirements."""
        if not api_key or len(api_key) < 32 or not api_key.isalnum():
            raise ConfigurationError("Invalid API key format")
        return api_key

    def _validate_endpoint_url(self, url: str) -> None:
        """Validate individual endpoint URL format."""
        try:
            result = urlparse(url)
            if not all([result.scheme == 'https', result.netloc, result.path]):
                raise ConfigurationError(f"Invalid endpoint URL: {url}")
        except Exception as e:
            raise ConfigurationError(f"Invalid endpoint URL {url}: {str(e)}")