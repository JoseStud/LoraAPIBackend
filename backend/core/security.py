"""Security dependencies for the application."""

from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from backend.core.config import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def get_api_key(api_key: str = Security(api_key_header)):
    """FastAPI dependency to validate the API key.

    If the `API_KEY` is not set in the application settings, this dependency
    will allow the request to proceed. Otherwise, it will validate the key
    provided in the `X-API-Key` header.
    """
    if settings.API_KEY and api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return api_key
