"""Runtime settings the Vue SPA loads at startup."""

from typing import Optional

from pydantic import BaseModel, Field


class GenerationPollingSettings(BaseModel):
    """Polling intervals for the generation views, in milliseconds."""

    queueMs: int = Field(description="Active-job queue polling interval.")
    websocketRetryMs: int = Field(description="Delay before reconnecting the socket.")
    systemStatusMs: int = Field(description="System status polling interval.")


class FrontendSettings(BaseModel):
    """Configuration served to the SPA by ``GET /v1/frontend/settings``."""

    backendUrl: str = Field(
        description="API base URL the SPA uses: absolute, or a path such as /api/v1."
    )
    backendApiKey: Optional[str] = Field(
        default=None,
        description=(
            "The configured API_KEY, for the X-API-Key header. Served to any "
            "caller: it is not an access control (README, Security model)."
        ),
    )
    generationPolling: GenerationPollingSettings
