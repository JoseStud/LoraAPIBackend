"""Frontend Configuration Module

Centralized configuration management using Pydantic BaseSettings for the LoRA Manager frontend.
Handles environment variables, timeouts, feature flags, and other application settings.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class FrontendSettings(BaseSettings):
    """Frontend application settings."""
    
    # Backend connection
    backend_url: str = Field(
        default="http://localhost:8000/v1",
        env="BACKEND_URL",
        description="Backend API base URL with /v1 prefix",
    )
    
    backend_host: str = Field(
        default="localhost",
        env="BACKEND_HOST", 
        description="Backend host/IP address",
    )
    
    backend_port: int = Field(
        default=8000,
        env="BACKEND_PORT",
        description="Backend port number",
    )
    
    @field_validator('backend_url', mode='before')
    @classmethod
    def construct_backend_url(cls, v, info):
        """Construct backend URL if not explicitly provided."""
        if v == "http://localhost:8000/v1" and ('backend_host' in info.data or 'backend_port' in info.data):
            host = info.data.get('backend_host', 'localhost')
            port = info.data.get('backend_port', 8000)
            return f"http://{host}:{port}/v1"
        return v.rstrip('/') if v.endswith('/') else v
    
    # HTTP client configuration
    request_timeout: float = Field(
        default=30.0,
        env="REQUEST_TIMEOUT", 
        description="Default request timeout in seconds",
    )
    
    max_retries: int = Field(
        default=3,
        env="MAX_RETRIES",
        description="Maximum number of HTTP retry attempts",
    )
    
    # Frontend-specific settings
    template_debug: bool = Field(
        default=False,
        env="TEMPLATE_DEBUG",
        description="Enable template debugging",
    )
    
    static_files_cache_ttl: int = Field(
        default=3600,
        env="STATIC_CACHE_TTL",
        description="Static files cache TTL in seconds",
    )
    
    # Feature flags
    enable_pwa: bool = Field(
        default=True,
        env="ENABLE_PWA",
        description="Enable Progressive Web App features",
    )
    
    enable_websockets: bool = Field(
        default=True,
        env="ENABLE_WEBSOCKETS", 
        description="Enable WebSocket connections",
    )
    
    enable_analytics: bool = Field(
        default=False,
        env="ENABLE_ANALYTICS",
        description="Enable performance analytics",
    )
    
    # Cache configuration
    cache_ttl_default: int = Field(
        default=300,
        env="CACHE_TTL_DEFAULT",
        description="Default cache TTL in seconds",
    )
    
    cache_ttl_embeddings: int = Field(
        default=1800,
        env="CACHE_TTL_EMBEDDINGS", 
        description="Embeddings cache TTL in seconds",
    )
    
    cache_ttl_system_stats: int = Field(
        default=60,
        env="CACHE_TTL_SYSTEM_STATS",
        description="System stats cache TTL in seconds",
    )
    
    # Upload limits
    max_upload_size: int = Field(
        default=100 * 1024 * 1024,  # 100MB
        env="MAX_UPLOAD_SIZE",
        description="Maximum upload file size in bytes",
    )
    
    allowed_file_extensions: List[str] = Field(
        default=[".json", ".safetensors", ".ckpt", ".pt", ".bin"],
        env="ALLOWED_FILE_EXTENSIONS",
        description="Allowed file extensions for uploads",
    )
    
    # Template paths
    template_directory: str = Field(
        default="app/frontend/templates",
        env="TEMPLATE_DIRECTORY",
        description="Templates directory path",
    )
    
    static_directory: str = Field(
        default="app/frontend/static",
        env="STATIC_DIRECTORY", 
        description="Static files directory path",
    )
    
    # Logging configuration
    log_level: str = Field(
        default="INFO",
        env="LOG_LEVEL",
        description="Logging level",
    )
    
    log_format: str = Field(
        default="json",
        env="LOG_FORMAT", 
        description="Log format (json or text)",
    )
    
    # Security settings
    enable_cors: bool = Field(
        default=True,
        env="ENABLE_CORS",
        description="Enable CORS headers",
    )
    
    cors_origins: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:8080"],
        env="CORS_ORIGINS",
        description="Allowed CORS origins",
    )
    
    # Database settings (for direct frontend DB access if needed)
    database_url: Optional[str] = Field(
        default=None,
        env="DATABASE_URL",
        description="Direct database URL for frontend queries",
    )
    
    # Development settings
    hot_reload: bool = Field(
        default=False,
        env="HOT_RELOAD",
        description="Enable hot reload for development",
    )
    
    debug_mode: bool = Field(
        default=False,
        env="DEBUG_MODE",
        description="Enable debug mode",
    )
    
    # WebSocket settings
    websocket_url: Optional[str] = Field(
        default=None,
        env="WEBSOCKET_URL", 
        description="WebSocket server URL (defaults to backend_url with ws:// scheme)",
    )
    
    websocket_ping_interval: int = Field(
        default=30,
        env="WEBSOCKET_PING_INTERVAL",
        description="WebSocket ping interval in seconds",
    )
    
    @field_validator('backend_url')
    @classmethod
    def validate_backend_url(cls, v):
        """Ensure backend URL doesn't end with slash."""
        return v.rstrip('/')
    
    @field_validator('websocket_url', mode='before')
    @classmethod
    def set_websocket_url(cls, v, info):
        """Set WebSocket URL based on backend URL if not provided."""
        if v is None and 'backend_url' in info.data:
            backend_url = info.data['backend_url']
            if backend_url.startswith('https://'):
                return backend_url.replace('https://', 'wss://')
            elif backend_url.startswith('http://'):
                return backend_url.replace('http://', 'ws://')
        return v
    
    @field_validator('allowed_file_extensions')
    @classmethod
    def validate_extensions(cls, v):
        """Ensure extensions start with dot."""
        return [ext if ext.startswith('.') else f'.{ext}' for ext in v]
    
    def get_template_path(self) -> Path:
        """Get template directory as Path object."""
        return Path(self.template_directory)
    
    def get_static_path(self) -> Path:
        """Get static directory as Path object."""
        return Path(self.static_directory)
    
    def is_file_allowed(self, filename: str) -> bool:
        """Check if file extension is allowed."""
        return any(filename.lower().endswith(ext.lower()) for ext in self.allowed_file_extensions)
    
    def get_cors_config(self) -> Dict[str, Any]:
        """Get CORS configuration for FastAPI."""
        if not self.enable_cors:
            return {}
        
        return {
            "allow_origins": self.cors_origins,
            "allow_credentials": True,
            "allow_methods": ["*"],
            "allow_headers": ["*"],
        }
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Global settings instance
_settings: Optional[FrontendSettings] = None


def get_settings() -> FrontendSettings:
    """Get the application settings singleton."""
    global _settings
    if _settings is None:
        _settings = FrontendSettings()
    return _settings


def reset_settings():
    """Reset settings (useful for testing)."""
    global _settings
    _settings = None


# Convenience functions for common settings
def get_backend_url() -> str:
    """Get backend URL."""
    return get_settings().backend_url


def get_request_timeout() -> float:
    """Get request timeout."""
    return get_settings().request_timeout


def get_max_retries() -> int:
    """Get max retries."""
    return get_settings().max_retries


def is_debug_mode() -> bool:
    """Check if debug mode is enabled."""
    return get_settings().debug_mode


def get_cache_ttl(cache_type: str = 'default') -> int:
    """Get cache TTL for specific type."""
    settings = get_settings()
    cache_ttls = {
        'default': settings.cache_ttl_default,
        'embeddings': settings.cache_ttl_embeddings,
        'system_stats': settings.cache_ttl_system_stats,
        'static': settings.static_files_cache_ttl,
    }
    return cache_ttls.get(cache_type, settings.cache_ttl_default)
