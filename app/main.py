"""LoRA Manager main entry point.

Wire the FastAPI backend with the Vue single-page application build.
"""

from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.core.config import settings as backend_settings
from backend.main import app as backend_app

app = FastAPI(
    title="LoRA Manager",
    description="LoRA Adapter Management System with AI-Powered Recommendations",
    version="1.0.0",
)


def _build_cors_config() -> Dict[str, Any]:
    """Construct the CORS options from the backend settings."""

    allow_origins = list(backend_settings.CORS_ORIGINS)
    allow_credentials = backend_settings.CORS_ALLOW_CREDENTIALS
    if "*" in allow_origins:
        allow_credentials = False
    return {
        "allow_origins": allow_origins
        or ["http://localhost:5173", "http://localhost:8000"],
        "allow_credentials": allow_credentials,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }


def _normalise_public_api_url(raw_url: str | None) -> str:
    """Normalise the backend URL exposed to the SPA settings endpoint."""

    if raw_url is None:
        return "/api/v1"

    candidate = raw_url.strip()
    if not candidate:
        return "/api/v1"

    if candidate.startswith(("http://", "https://")):
        return candidate.rstrip("/") or "/api/v1"

    if not candidate.startswith("/"):
        candidate = f"/{candidate}"
    candidate = candidate.rstrip("/")
    return candidate or "/api/v1"


_cors = _build_cors_config()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors["allow_origins"],
    allow_credentials=_cors["allow_credentials"],
    allow_methods=_cors["allow_methods"],
    allow_headers=_cors["allow_headers"],
)

# Include backend API routes
app.mount("/api", backend_app)


class SPAStaticFiles(StaticFiles):
    """Static files handler that falls back to ``index.html`` for SPA routes."""

    def __init__(self, directory: Path) -> None:
        """Initialise the static file handler.

        Args:
            directory: Path containing the built SPA assets.

        """
        self.directory_path = directory
        super().__init__(
            directory=str(directory),
            html=True,
            check_dir=False,
        )

    async def get_response(self, path, scope):  # type: ignore[override]
        """Return static content or fall back to the SPA index page."""
        response = await super().get_response(path, scope)
        if response.status_code == 404:
            index_path = self.directory_path / "index.html"
            if index_path.exists():
                return await super().get_response("index.html", scope)
        return response


SPA_DIST_DIR = (Path(__file__).resolve().parent.parent / "dist").resolve()
SPA_STATIC_APP = SPAStaticFiles(SPA_DIST_DIR)


@app.get("/frontend/settings", tags=["frontend"])
async def frontend_settings():
    """Expose runtime configuration for the Vue SPA."""
    backend_url = _normalise_public_api_url(backend_settings.BACKEND_URL)
    return {
        "backendUrl": backend_url,
        "backendApiKey": backend_settings.API_KEY or None,
    }


# Service health endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "lora-manager"}


# Serve the compiled SPA assets (fallback to index.html for client-side routing)
app.mount("/", SPA_STATIC_APP, name="spa")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
