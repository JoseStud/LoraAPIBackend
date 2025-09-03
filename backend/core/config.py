"""Configuration settings for the application."""

from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Manages application settings."""

    # Database URL (override default sqlite). Example: postgresql+psycopg://user:pw@host:5432/db
    DATABASE_URL: Optional[str] = None
    API_KEY: Optional[str] = None
    
    # Redis URL for worker queue (optional)
    REDIS_URL: Optional[str] = None
    
    # Directory to scan for LoRA files and metadata (inside container)
    IMPORT_PATH: Optional[str] = "/app/loras"
    # Poll interval (seconds) for the importer when running in polling mode
    IMPORT_POLL_SECONDS: int = 10
    
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


settings = Settings()
