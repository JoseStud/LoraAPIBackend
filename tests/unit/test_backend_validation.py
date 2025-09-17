"""Tests for Pydantic schema validation and backend configuration.
"""
import pytest
from backend.utils.cache import TTLCache
from backend.core.config import Settings
from app.frontend.utils.http import HTTPClient
from pydantic import ValidationError


class TestSettings:
    """Tests aligned with backend.core.config.Settings."""

    def test_backend_url_default_and_types(self):
        s = Settings()
        assert isinstance(s.BACKEND_HOST, str)
        assert isinstance(s.BACKEND_PORT, int)
        # get_backend_url should construct a URL with host:port
        url = s.get_backend_url
        assert url.startswith("http://") or url.startswith("https://")

    def test_backend_url_override(self):
        # When BACKEND_URL is provided, get_backend_url should return it (sans trailing slash)
        s = Settings(BACKEND_URL="http://localhost:9999/api/")
        assert s.get_backend_url == "http://localhost:9999/api"


class TestTTLCache:
    """Test TTL cache functionality."""
    
    def test_cache_basic_operations(self):
        """Test basic cache set/get operations."""
        cache = TTLCache(default_ttl=60)
        
        # Test set and get
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"
        
        # Test non-existent key
        assert cache.get("nonexistent") is None
        assert cache.get("nonexistent", "default") == "default"
    
    def test_cache_ttl_expiration(self):
        """Test that cache entries expire after TTL."""
        cache = TTLCache(default_ttl=0.1)  # 100ms TTL
        
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"
        
        # Wait for expiration
        import time
        time.sleep(0.2)
        
        assert cache.get("key1") is None
    
    def test_cache_clear(self):
        """Test cache clearing."""
        cache = TTLCache(default_ttl=60)
        
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        assert len(cache) == 2
        
        cache.clear()
        assert len(cache) == 0
        assert cache.get("key1") is None


class TestHTTPClient:
    """Test HTTP client functionality."""
    
    @pytest.fixture
    def client(self):
        """Create HTTP client for testing."""
        return HTTPClient(base_url="http://localhost:8000", timeout=5.0, max_retries=2)
    
    def test_client_initialization(self, client):
        """Test HTTP client initializes correctly."""
        assert client.base_url == "http://localhost:8000"
        assert client.timeout == 5.0
        assert client.max_retries == 2
    
    def test_build_url(self, client):
        """Test URL building logic."""
        assert client._build_url("/api/test") == "http://localhost:8000/api/test"
        assert client._build_url("api/test") == "http://localhost:8000/api/test"
        
        # Test with existing query params
        url = client._build_url("/api/test", params={"key": "value"})
        assert "key=value" in url
    
    def test_invalid_base_url(self):
        """Test that invalid base URLs raise errors."""
        with pytest.raises(ValueError):
            HTTPClient(base_url="not-a-url")
    
    def test_invalid_timeout(self):
        """Test that invalid timeouts raise errors."""
        with pytest.raises(ValueError):
            HTTPClient(base_url="http://localhost", timeout=-1)
        
        with pytest.raises(ValueError):
            HTTPClient(base_url="http://localhost", timeout=0)
