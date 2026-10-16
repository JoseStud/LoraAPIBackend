"""The backend's one CORS policy.

``create_app()`` installs it, so it applies whether the backend runs on its
own (``backend.main:app``) or mounted at ``/api`` by ``app.main``. The
composition root adds no CORS middleware of its own: its SPA files are
same-origin and its ``/health`` is a liveness probe, not a browser API, and a
second middleware would answer ``/api`` requests twice.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import Settings


def add_cors_middleware(app: FastAPI, settings: Settings) -> None:
    """Install the CORS middleware configured by ``CORS_ORIGINS``.

    Credentials are never allowed together with a ``"*"`` origin: browsers
    reject credentialed wildcard responses, and Starlette would instead echo
    every request origin, which amounts to allowing any site with credentials.
    """
    origins = list(settings.CORS_ORIGINS)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS and "*" not in origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
