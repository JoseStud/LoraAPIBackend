"""
HTTP Client utilities for frontend routes.

Provides a centralized httpx wrapper with consistent timeouts, retries, 
centralized logging and error handling for backend requests.
"""

import httpx
import logging
from typing import Optional, Dict, Any, Tuple, Union
import asyncio
from urllib.parse import urljoin
import json

logger = logging.getLogger(__name__)


class BackendError(Exception):
    """Exception raised when backend requests fail."""
    def __init__(self, message: str, status_code: Optional[int] = None, response_data: Optional[Dict] = None):
        self.message = message
        self.status_code = status_code
        self.response_data = response_data
        super().__init__(self.message)


class HTTPClient:
    """Centralized HTTP client for backend requests."""
    
    def __init__(self, base_url: str, timeout: float = 30.0, max_retries: int = 3):
        """Initialize HTTP client with configuration.
        
        Args:
            base_url: Base URL for backend API
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.max_retries = max_retries
        self._client = None
    
    @property
    def client(self) -> httpx.AsyncClient:
        """Get or create the httpx client instance."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout),
                limits=httpx.Limits(max_keepalive_connections=10, max_connections=20)
            )
        return self._client
    
    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    def _build_url(self, path: str) -> str:
        """Build full URL from path."""
        if path.startswith('http'):
            return path
        return urljoin(self.base_url + '/', path.lstrip('/'))
    
    def _log_request(self, method: str, url: str, **kwargs):
        """Log outgoing request."""
        logger.debug(f"HTTP {method.upper()} {url}")
        if 'params' in kwargs:
            logger.debug(f"Query params: {kwargs['params']}")
    
    def _log_response(self, response: httpx.Response, duration: float):
        """Log response details."""
        logger.debug(
            f"HTTP {response.status_code} {response.url} "
            f"({duration:.3f}s) {len(response.content)} bytes"
        )
        if response.status_code >= 400:
            logger.warning(f"HTTP Error {response.status_code}: {response.text[:200]}")
    
    async def _make_request(
        self, 
        method: str, 
        url: str, 
        retry_count: int = 0,
        **kwargs
    ) -> httpx.Response:
        """Make HTTP request with retry logic."""
        import time
        start_time = time.time()
        
        try:
            self._log_request(method, url, **kwargs)
            response = await self.client.request(method, url, **kwargs)
            duration = time.time() - start_time
            self._log_response(response, duration)
            return response
            
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            duration = time.time() - start_time
            logger.warning(f"Request failed after {duration:.3f}s: {e}")
            
            if retry_count < self.max_retries:
                wait_time = min(2 ** retry_count, 10)  # Exponential backoff, max 10s
                logger.info(f"Retrying in {wait_time}s (attempt {retry_count + 1}/{self.max_retries})")
                await asyncio.sleep(wait_time)
                return await self._make_request(method, url, retry_count + 1, **kwargs)
            
            raise BackendError(f"Backend request failed after {self.max_retries} retries: {e}")
        
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"Unexpected error after {duration:.3f}s: {e}")
            raise BackendError(f"Unexpected request error: {e}")
    
    async def request(
        self, 
        method: str, 
        path: str, 
        raise_for_status: bool = True,
        **kwargs
    ) -> Tuple[int, Union[Dict[str, Any], str]]:
        """Make HTTP request and return (status_code, data).
        
        Args:
            method: HTTP method (GET, POST, etc.)
            path: API endpoint path
            raise_for_status: Whether to raise exception for HTTP errors
            **kwargs: Additional arguments for httpx request
            
        Returns:
            Tuple of (status_code, response_data)
            
        Raises:
            BackendError: If request fails or backend returns error
        """
        url = self._build_url(path)
        response = await self._make_request(method, url, **kwargs)
        
        # Try to parse JSON response
        try:
            data = response.json()
        except (json.JSONDecodeError, ValueError):
            data = response.text
        
        if raise_for_status and response.status_code >= 400:
            error_msg = f"Backend error {response.status_code}"
            if isinstance(data, dict) and 'detail' in data:
                error_msg += f": {data['detail']}"
            elif isinstance(data, str):
                error_msg += f": {data[:200]}"
            
            raise BackendError(
                error_msg, 
                status_code=response.status_code, 
                response_data=data if isinstance(data, dict) else None
            )
        
        return response.status_code, data
    
    async def get(self, path: str, params: Optional[Dict] = None, **kwargs) -> Tuple[int, Any]:
        """Make GET request."""
        return await self.request('GET', path, params=params, **kwargs)
    
    async def post(self, path: str, data: Optional[Dict] = None, json: Optional[Dict] = None, **kwargs) -> Tuple[int, Any]:
        """Make POST request."""
        return await self.request('POST', path, data=data, json=json, **kwargs)
    
    async def put(self, path: str, data: Optional[Dict] = None, json: Optional[Dict] = None, **kwargs) -> Tuple[int, Any]:
        """Make PUT request."""
        return await self.request('PUT', path, data=data, json=json, **kwargs)
    
    async def delete(self, path: str, **kwargs) -> Tuple[int, Any]:
        """Make DELETE request."""
        return await self.request('DELETE', path, **kwargs)


# Global client instance that will be configured by the application
_http_client: Optional[HTTPClient] = None


def configure_http_client(base_url: str, timeout: float = 30.0, max_retries: int = 3):
    """Configure the global HTTP client."""
    global _http_client
    _http_client = HTTPClient(base_url, timeout, max_retries)


def get_http_client() -> HTTPClient:
    """Get the configured HTTP client."""
    if _http_client is None:
        raise RuntimeError("HTTP client not configured. Call configure_http_client() first.")
    return _http_client


async def fetch_backend(
    path: str, 
    method: str = 'GET', 
    params: Optional[Dict] = None,
    data: Optional[Dict] = None,
    json: Optional[Dict] = None,
    **kwargs
) -> Tuple[int, Any]:
    """Convenience function to make backend requests.
    
    Returns (status_code, response_data) tuple.
    """
    client = get_http_client()
    
    if method.upper() == 'GET':
        return await client.get(path, params=params, **kwargs)
    elif method.upper() == 'POST':
        return await client.post(path, data=data, json=json, **kwargs)
    elif method.upper() == 'PUT':
        return await client.put(path, data=data, json=json, **kwargs)
    elif method.upper() == 'DELETE':
        return await client.delete(path, **kwargs)
    else:
        return await client.request(method, path, params=params, data=data, json=json, **kwargs)


async def close_http_client():
    """Close the global HTTP client."""
    global _http_client
    if _http_client:
        await _http_client.close()
        _http_client = None
