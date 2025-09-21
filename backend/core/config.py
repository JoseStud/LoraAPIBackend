"""Configuration settings for the application."""

from typing import List, Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Manages application settings."""

    # Database URL (override default sqlite). Example: postgresql+psycopg://user:pw@host:5432/db
    DATABASE_URL: Optional[str] = None
    API_KEY: Optional[str] = None
    
    # Backend API configuration
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000
    BACKEND_URL: Optional[str] = None  # Full URL override if needed
    
    # Redis URL for worker queue (optional)
    REDIS_URL: Optional[str] = None
    
    # Directory to scan for LoRA files and metadata (inside container)
    IMPORT_PATH: Optional[str] = "/app/loras"
    # Poll interval (seconds) for the importer when running in polling mode
    IMPORT_POLL_SECONDS: int = 10
    # Optional glob-style patterns (relative to IMPORT_PATH) to skip during import
    IMPORT_IGNORE_PATTERNS: List[str] = []
    # Importer bootstrap behaviour
    IMPORT_ON_STARTUP: bool = False
    IMPORT_ON_STARTUP_FORCE_RESYNC: bool = False
    IMPORT_ON_STARTUP_DRY_RUN: bool = False
    
    # SDNext Integration Settings
    SDNEXT_BASE_URL: Optional[str] = None  # e.g., "http://localhost:7860"
    SDNEXT_USERNAME: Optional[str] = None  # for --auth mode
    SDNEXT_PASSWORD: Optional[str] = None  # for --auth mode  
    SDNEXT_TIMEOUT: int = 120  # request timeout in seconds
    SDNEXT_POLL_INTERVAL: int = 2  # polling interval for progress
    SDNEXT_DEFAULT_STEPS: int = 20
    SDNEXT_DEFAULT_SAMPLER: str = "DPM++ 2M"
    SDNEXT_DEFAULT_CFG_SCALE: float = 7.0
    SDNEXT_OUTPUT_DIR: Optional[str] = None  # local storage for generated images
    
    # CORS settings for backend API
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8782",
        "http://127.0.0.1:8782",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True
    
    @property
    def get_backend_url(self) -> str:
        """Get the backend URL, with automatic construction if not explicitly set."""
        if self.BACKEND_URL:
            return self.BACKEND_URL.rstrip('/')
        return f"http://{self.BACKEND_HOST}:{self.BACKEND_PORT}"


settings = Settings()
