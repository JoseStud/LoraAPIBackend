"""FastAPI application factory and global wiring for the LoRA backend."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.api.v1 import (
    adapters,
    compose,
    dashboard,
    deliveries,
    generation,
    import_export,
    recommendations,
    websocket,
)
from backend.core.config import settings
from backend.core.database import init_db
from backend.core.logging import setup_logging
from backend.core.security import get_api_key
from backend.services.recommendations import RecommendationService


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App lifespan handler used to initialize resources on startup."""
    # Initialize logging and DB at startup
    setup_logging()
    init_db()
    startup_tasks = []
    # Warm up recommendation models so the first request is fast
    try:
        RecommendationService.preload_models()
    except Exception:  # pragma: no cover - defensive guard against startup failures
        # Defer model initialization to first request if warm-up fails
        pass

    if settings.IMPORT_ON_STARTUP and settings.IMPORT_PATH:
        loop = asyncio.get_running_loop()
        importer_logger = logging.getLogger("lora.importer.startup")

        async def _run_startup_import() -> None:
            def _worker():
                try:
                    from scripts.importer import run_one_shot_import

                    import_path = settings.IMPORT_PATH
                    if not import_path:
                        importer_logger.warning(
                            "Startup importer skipped: IMPORT_PATH not configured",
                        )
                        return

                    if not os.path.isdir(import_path):
                        importer_logger.warning(
                            "Startup importer skipped: directory not found (%s)",
                            import_path,
                        )
                        return

                    summary = run_one_shot_import(
                        import_path,
                        dry_run=settings.IMPORT_ON_STARTUP_DRY_RUN,
                        force_resync=settings.IMPORT_ON_STARTUP_FORCE_RESYNC,
                        ignore_patterns=(settings.IMPORT_IGNORE_PATTERNS or None),
                    )
                    importer_logger.info(
                        "Startup import finished: processed=%d skipped=%d errors=%d orphans=%d",
                        summary.get("processed", 0),
                        summary.get("skipped", 0),
                        summary.get("errors", 0),
                        len(summary.get("safetensors_without_metadata", [])),
                    )
                except Exception:  # pragma: no cover - defensive guard
                    importer_logger.exception("Startup importer run failed")

            # Delay execution very slightly to let the event loop settle
            await asyncio.sleep(0)
            await loop.run_in_executor(None, _worker)

        task = asyncio.create_task(_run_startup_import())
        startup_tasks.append(task)

    try:
        yield
    finally:
        if startup_tasks:
            await asyncio.gather(*startup_tasks, return_exceptions=True)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(title="LoRA Manager Backend (MVP)", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include API routers with consistent /v1 prefix
    app.include_router(adapters.router, prefix="/v1", dependencies=[Depends(get_api_key)])
    app.include_router(compose.router, prefix="/v1", dependencies=[Depends(get_api_key)])
    app.include_router(deliveries.router, prefix="/v1", dependencies=[Depends(get_api_key)])
    app.include_router(generation.router, prefix="/v1", dependencies=[Depends(get_api_key)])
    app.include_router(recommendations.router, prefix="/v1", dependencies=[Depends(get_api_key)])
    app.include_router(import_export.router, prefix="/v1", dependencies=[Depends(get_api_key)])
    app.include_router(dashboard.router, prefix="/v1")
    app.include_router(websocket.router, prefix="/v1")  # Align WebSocket with API versioning

    # Note: Unversioned routes are intentionally not included; use /v1/*

    @app.get("/health")
    def health():
        """Return a simple health status used by tests and readiness checks."""
        return {"status": "ok"}

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        """Format HTTPException as an RFC7807 problem detail response."""
        problem = {
            "type": "about:blank",
            "title": exc.detail if isinstance(exc.detail, str) else "HTTP error",
            "status": exc.status_code,
        }
        return JSONResponse(status_code=exc.status_code, content=problem)

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        """Return an RFC7807-style problem detail for unexpected errors."""
        problem = {
            "type": "about:blank",
            "title": "Internal Server Error",
            "status": 500,
            "detail": str(exc),
        }
        return JSONResponse(status_code=500, content=problem)

    return app


# Create the app instance for backward compatibility
app = create_app()
