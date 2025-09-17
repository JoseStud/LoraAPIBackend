"""FastAPI application factory and global wiring for the LoRA backend."""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.api.v1 import (
    adapters,
    compose,

    deliveries,
    generation,
    recommendations,
    websocket,


    dashboard,
    import_export,

)
from backend.core.database import init_db
from backend.core.logging import setup_logging
from backend.core.security import get_api_key
from backend.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App lifespan handler used to initialize resources on startup."""
    # Initialize logging and DB at startup
    setup_logging()
    init_db()
    yield


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
    app.include_router(dashboard.router)  # Dashboard uses root prefix for frontend compatibility
    app.include_router(websocket.router)  # WebSocket doesn't use API key auth or versioning

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
