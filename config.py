"""Configuration settings for the application."""

from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Manages application settings."""

    # Database URL (override default sqlite). Example: postgresql+psycopg://user:pw@host:5432/db
    DATABASE_URL: Optional[str] = None
    API_KEY: Optional[str] = None



settings = Settings()
