"""Configuration settings for the application."""

from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Manages application settings."""

    # Storage selection: 'local' or 's3'
    STORAGE_TYPE: str = "local"

    # Database URL (override default sqlite). Example: postgresql+psycopg://user:pw@host:5432/db
    DATABASE_URL: Optional[str] = None

    # S3 / object storage settings (used when STORAGE_TYPE == 's3')
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    S3_BUCKET: Optional[str] = None
    S3_REGION: Optional[str] = None
    S3_ENDPOINT_URL: Optional[str] = None


settings = Settings()
