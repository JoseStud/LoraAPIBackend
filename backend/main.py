"""FastAPI application factory and global wiring for the LoRA backend."""

import asyncio
import os
from contextlib import asynccontextmanager
from http import HTTPStatus
from typing import Any, Dict

from fastapi import Depends, FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response
from fastapi.utils import is_body_allowed_for_status_code
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.api.v1 import (
    adapters,
    analytics,
    compose,
    dashboard,
    deliveries,
    frontend,
    generation,
    import_export,
    recommendations,
    system,
    websocket,
)
from backend.api.v1.generation import images as generation_images
from backend.core.config import settings
from backend.core.cors import add_cors_middleware
from backend.core.database import init_db
from backend.core.logging import get_logger, setup_logging
from backend.core.security import get_api_key
from backend.delivery import ensure_delivery_system
from backend.services.generation import GenerationWaitTimeout
from backend.services.in_process_jobs import get_in_process_job_runner
from backend.services.job_recovery import JobRecovery
from backend.services.queue import QueueUnavailableError
from backend.services.recommendations import EmbeddingService
from backend.services.websocket import JobProgressMonitor, websocket_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App lifespan handler used to initialize resources on startup."""
    # Initialize logging and DB at startup
    setup_logging()
    init_db()
    ensure_delivery_system()
    job_recovery = JobRecovery.from_settings()
    job_recovery.start()
    job_monitor = JobProgressMonitor.from_settings(websocket_service.manager)
    job_monitor.start()
    startup_tasks = []
    recommendation_logger = get_logger("lora.recommendations.startup")

    async def _preload_recommendations() -> None:
        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(None, EmbeddingService.preload_models)
        except Exception:  # pragma: no cover - defensive guard against startup failures
            recommendation_logger.exception(
                "Recommendation model preload failed; falling back to "
                "lazy initialization",
            )
        else:
            recommendation_logger.info(
                "Recommendation model preload completed successfully"
            )

    startup_tasks.append(asyncio.create_task(_preload_recommendations()))

    if settings.IMPORT_ON_STARTUP and settings.IMPORT_PATH:
        loop = asyncio.get_running_loop()
        importer_logger = get_logger("lora.importer.startup")

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
                        "Startup import finished: processed=%d skipped=%d "
                        "errors=%d orphans=%d",
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
        await job_monitor.stop()
        await job_recovery.stop()
        # Jobs that never started are requeued by recovery at the next start.
        await asyncio.to_thread(get_in_process_job_runner().stop)
        # On shutdown, ensure all background tasks are completed or cancelled
        lifespan_logger = get_logger("lora.lifespan")
        for task in startup_tasks:
            try:
                if task.done():
                    await task
                else:
                    await asyncio.wait_for(asyncio.shield(task), timeout=1.0)
            except asyncio.TimeoutError:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    # Task cancellation is expected on shutdown
                    pass
                except Exception:  # pragma: no cover - defensive guard
                    lifespan_logger.exception("Background task failed during shutdown")
            except asyncio.CancelledError:
                # Task cancellation is expected on shutdown
                pass
            except Exception:  # pragma: no cover - defensive guard
                lifespan_logger.exception("Background task failed during shutdown")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(title="LoRA Manager Backend (MVP)", lifespan=lifespan)

    # The only CORS middleware; app.main mounts this app at /api without its own.
    add_cors_middleware(app, settings)

    # Include API routers with consistent /v1 prefix
    app.include_router(
        adapters.router, prefix="/v1", dependencies=[Depends(get_api_key)]
    )
    app.include_router(
        analytics.router, prefix="/v1", dependencies=[Depends(get_api_key)]
    )
    app.include_router(
        compose.router, prefix="/v1", dependencies=[Depends(get_api_key)]
    )
    app.include_router(
        deliveries.router, prefix="/v1", dependencies=[Depends(get_api_key)]
    )
    app.include_router(
        generation.router, prefix="/v1", dependencies=[Depends(get_api_key)]
    )
    app.include_router(
        recommendations.router, prefix="/v1", dependencies=[Depends(get_api_key)]
    )
    app.include_router(
        import_export.router, prefix="/v1", dependencies=[Depends(get_api_key)]
    )
    app.include_router(dashboard.router, prefix="/v1")
    # Keyless: the SPA loads its settings, the key included, before any
    # authenticated request (README, "Security model").
    app.include_router(frontend.router, prefix="/v1")
    app.include_router(system.router, prefix="/v1")
    # Keyless: <img> tags cannot send X-API-Key (README, "Security model").
    app.include_router(generation_images.router, prefix="/v1")
    app.include_router(
        websocket.router, prefix="/v1"
    )  # Canonical WebSocket path -> /api/v1/ws/progress

    # Note: Unversioned routes are intentionally not included; use /v1/*

    @app.get("/health")
    def health():
        """Return a simple health status used by tests and readiness checks."""
        return {"status": "ok"}

    # Registered for Starlette's HTTPException (FastAPI's subclasses it), so
    # the router's own 404/405 get the same shape as the handlers' errors.
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)

    @app.exception_handler(QueueUnavailableError)
    async def queue_unavailable_handler(request: Request, exc: QueueUnavailableError):
        """Report a job the durable queue rejected as a 503 problem detail."""
        get_logger("lora.api").error(
            "Job queue unavailable during %s %s",
            request.method,
            request.url.path,
            exc_info=exc,
        )
        problem = {
            "type": "about:blank",
            "title": "Job queue unavailable",
            "status": 503,
            "detail": "The job could not be queued. Try again once Redis is reachable.",
        }
        return JSONResponse(status_code=503, content=problem)

    @app.exception_handler(GenerationWaitTimeout)
    async def generation_wait_timeout_handler(
        request: Request, exc: GenerationWaitTimeout
    ):
        """Name the still-running job of a blocking generation request (504)."""
        job_url = request.url_for("get_generation_job", job_id=exc.job_id).path
        problem = {
            "type": "about:blank",
            "title": "Generation still running",
            "status": 504,
            "detail": (
                f"Generation job {exc.job_id} did not finish within "
                f"{exc.timeout_seconds:g} seconds. It is still queued or running; "
                f"follow it at {job_url}."
            ),
            "job_id": exc.job_id,
            "job_url": job_url,
        }
        return JSONResponse(status_code=504, content=problem)

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        """Return an RFC7807-style problem detail for unexpected errors.

        The exception text can contain paths, SQL or configuration values, so it is
        logged server-side and never sent to the client.
        """
        get_logger("lora.api").exception(
            "Unhandled error during %s %s",
            request.method,
            request.url.path,
            exc_info=exc,
        )
        problem = {
            "type": "about:blank",
            "title": "Internal Server Error",
            "status": 500,
            "detail": "An unexpected error occurred. See the server logs for details.",
        }
        return JSONResponse(status_code=500, content=problem)

    return app


def _status_phrase(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).phrase
    except ValueError:
        return "HTTP error"


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> Response:
    """Format an HTTPException as an RFC 7807 problem detail response.

    A string ``detail`` is the problem's ``title``. Any other ``detail`` (a
    list or dict a handler raised on purpose) keeps its structure in the
    ``errors`` member, under the status phrase as the title. The exception's
    headers (``Allow`` on a 405, ``WWW-Authenticate``) are kept, and statuses
    that forbid a body (204, 304) get none.
    """
    headers = getattr(exc, "headers", None)
    if not is_body_allowed_for_status_code(exc.status_code):
        return Response(status_code=exc.status_code, headers=headers)

    problem: Dict[str, Any] = {"type": "about:blank", "status": exc.status_code}
    if isinstance(exc.detail, str) and exc.detail:
        problem["title"] = exc.detail
    else:
        problem["title"] = _status_phrase(exc.status_code)
        if exc.detail is not None:
            problem["errors"] = jsonable_encoder(exc.detail)
    return JSONResponse(status_code=exc.status_code, content=problem, headers=headers)


def app() -> FastAPI:
    """Return a FastAPI application for ASGI factory loaders."""
    return create_app()


__all__ = ["create_app", "lifespan", "app"]
