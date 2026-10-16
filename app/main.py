"""LoRA Manager main entry point (``uvicorn app.main:app``).

The composition root: mounts the backend from ``backend.main.create_app()``
at ``/api`` and serves the Vue SPA build at ``/``. Every API route, the
frontend settings included, and the CORS policy belong to the backend app;
this module adds only the static files and a process liveness ``/health``.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from backend.main import create_app as create_backend_app


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Run the mounted backend's startup and shutdown exactly once."""
    async with backend_app.router.lifespan_context(backend_app):
        yield


app = FastAPI(
    title="LoRA Manager",
    description="LoRA Adapter Management System with AI-Powered Recommendations",
    version="1.0.0",
    lifespan=lifespan,
)


# Include backend API routes
backend_app = create_backend_app()
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

    async def check_config(self) -> None:
        """Answer 404 instead of failing while the SPA has not been built."""
        if self.directory_path.is_dir():
            await super().check_config()

    async def get_response(self, path, scope):  # type: ignore[override]
        """Return static content or fall back to the SPA index page."""
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            # Starlette raises (rather than returns) 404 for unknown paths.
            index_path = self.directory_path / "index.html"
            if exc.status_code != 404 or not index_path.is_file():
                raise
        return await super().get_response("index.html", scope)


# Vite builds into app/dist (root app/frontend, outDir ../dist); see vite.config.ts.
SPA_DIST_DIR = (Path(__file__).resolve().parent / "dist").resolve()
SPA_STATIC_APP = SPAStaticFiles(SPA_DIST_DIR)


# Process liveness for Docker healthchecks and the demo smoke test; the
# backend's own check is /api/health.
@app.get("/health")
def health_check():
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
