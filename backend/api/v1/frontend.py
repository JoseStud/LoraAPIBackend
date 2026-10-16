"""Runtime settings for the Vue SPA.

Mounted without the API key: the SPA needs these settings, including the key
itself, before it can send any authenticated request (README, "Security
model": the key is not an access control).
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from backend.core.config import settings
from backend.schemas import FrontendSettings, GenerationPollingSettings

router = APIRouter(prefix="/frontend", tags=["frontend"])

DEFAULT_PUBLIC_API_URL = "/api/v1"
"""Where ``app.main`` serves the API, relative to the SPA's origin."""


def normalise_public_api_url(raw_url: Optional[str]) -> str:
    """Return the API base URL the SPA should use for ``BACKEND_URL``.

    Absolute ``http(s)`` URLs lose their trailing slash; anything else is
    treated as a path on the SPA's origin and gains a leading slash. An unset
    or blank value is :data:`DEFAULT_PUBLIC_API_URL`.
    """
    if raw_url is None:
        return DEFAULT_PUBLIC_API_URL

    candidate = raw_url.strip()
    if not candidate:
        return DEFAULT_PUBLIC_API_URL

    if candidate.startswith(("http://", "https://")):
        return candidate.rstrip("/") or DEFAULT_PUBLIC_API_URL

    if not candidate.startswith("/"):
        candidate = f"/{candidate}"
    return candidate.rstrip("/") or DEFAULT_PUBLIC_API_URL


@router.get("/settings", response_model=FrontendSettings)
def get_frontend_settings() -> FrontendSettings:
    """Expose the runtime configuration the SPA bootstraps from."""
    return FrontendSettings(
        backendUrl=normalise_public_api_url(settings.BACKEND_URL),
        backendApiKey=settings.API_KEY or None,
        generationPolling=GenerationPollingSettings(
            queueMs=settings.GENERATION_QUEUE_POLL_INTERVAL_MS,
            websocketRetryMs=settings.GENERATION_WEBSOCKET_RETRY_INTERVAL_MS,
            systemStatusMs=settings.GENERATION_SYSTEM_STATUS_POLL_INTERVAL_MS,
        ),
    )
