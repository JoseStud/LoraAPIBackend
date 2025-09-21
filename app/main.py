"""LoRA Manager - Main Application Entry Point.

This module wires the FastAPI backend with the Vue single page application
served from the Vite build output.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Import backend application
from backend.main import app as backend_app
from backend.core.config import settings as backend_settings

# Create the main application
app = FastAPI(
    title="LoRA Manager",
    description="LoRA Adapter Management System with AI-Powered Recommendations",
    version="1.0.0",
)

# Add CORS middleware using frontend settings
from app.frontend.config import get_settings as get_frontend_settings

_fe_settings = get_frontend_settings()
_cors = _fe_settings.get_cors_config()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors.get("allow_origins", ["http://localhost:5173", "http://localhost:8000"]),
    allow_credentials=_cors.get("allow_credentials", True),
    allow_methods=_cors.get("allow_methods", ["*"]),
    allow_headers=_cors.get("allow_headers", ["*"]),
)

# Include backend API routes
app.mount("/api", backend_app)


class SPAStaticFiles(StaticFiles):
    """Static files handler that falls back to ``index.html`` for SPA routes."""

    def __init__(self, directory: Path):  # noqa: D401 - short init docstring inherited
        self.directory_path = directory
        super().__init__(
            directory=str(directory),
            html=True,
            check_dir=False,
        )

    async def get_response(self, path, scope):  # type: ignore[override]
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
    backend_url = _fe_settings.backend_url.rstrip("/")
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
