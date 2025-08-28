"""FastAPI application factory and global wiring for the LoRA backend."""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from db import init_db
from logging_config import setup_logging
from routers import adapters, compose, deliveries
from security import get_api_key


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App lifespan handler used to initialize resources on startup."""
    # Initialize logging and DB at startup
    setup_logging()
    init_db()
    yield


app = FastAPI(title="LoRA Manager Backend (MVP)", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# DB initialization is handled by the FastAPI lifespan handler above.


app.include_router(adapters.router, dependencies=[Depends(get_api_key)])
app.include_router(compose.router, dependencies=[Depends(get_api_key)])
app.include_router(deliveries.router, dependencies=[Depends(get_api_key)])


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
