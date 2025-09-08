"""
Tests for Pydantic schema validation and backend configuration.
"""
import pytest
from pydantic import ValidationError

from backend.config import Settings
from backend.cache import TTLCache
from backend.utils.http import HTTPClient


class TestSettings:
    """Test Pydantic settings validation."""
    
    def test_default_settings(self):
        """Test that default settings are valid."""
        settings = Settings()
        assert settings.timeout > 0
        assert settings.base_url is not None
        assert isinstance(settings.enable_analytics, bool)
    
    def test_timeout_validation(self):
        """Test timeout must be positive."""
        with pytest.raises(ValidationError):
            Settings(timeout=-1)
        
        with pytest.raises(ValidationError):
            Settings(timeout=0)
    
    def test_base_url_validation(self):
        """Test base_url must be valid URL."""
        # Valid URLs should work
        settings = Settings(base_url="http://localhost:8000")
        assert settings.base_url == "http://localhost:8000"
        
        settings = Settings(base_url="https://api.example.com")
        assert settings.base_url == "https://api.example.com"
        
        # Invalid URLs should fail
        with pytest.raises(ValidationError):
            Settings(base_url="not-a-url")
        
        with pytest.raises(ValidationError):
            Settings(base_url="ftp://invalid")


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
