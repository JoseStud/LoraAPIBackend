"""Logging configuration for the application.

Backend modules log through :func:`get_logger`, which returns a structlog
logger that hands every event to the standard library logger of the same
name. Both call styles render the same way::

    logger.info("Delivery %s skipped: status is %s", job_id, status)
    logger.info("Delivery skipped", job_id=job_id, status=status)

Positional ``%s`` arguments are interpolated into the message (as with
:mod:`logging`) and keyword arguments become JSON fields. Levels, handlers
and ``caplog`` therefore work exactly as for stdlib loggers.
"""

from __future__ import annotations

import logging
import sys
import threading
from typing import Optional

import structlog
from structlog.stdlib import BoundLogger

_configure_lock = threading.Lock()


def configure_structlog() -> None:
    """Route structlog events through stdlib logging, rendered as JSON."""
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def _ensure_structlog_configured() -> None:
    """Apply :func:`configure_structlog` unless structlog is configured already.

    Without it structlog would print every event straight to stdout,
    bypassing stdlib levels and handlers (scripts, tests, worker processes
    that log before :func:`setup_logging` runs).
    """
    if structlog.is_configured():
        return
    with _configure_lock:
        if not structlog.is_configured():
            configure_structlog()


def get_logger(name: Optional[str] = None) -> BoundLogger:
    """Return the backend logger for ``name`` (normally ``__name__``)."""
    _ensure_structlog_configured()
    return structlog.stdlib.get_logger(name)


def setup_logging() -> None:
    """Configure process-wide logging for the API and worker processes.

    Adds an INFO-level stdout handler to the root logger unless one is
    configured already, and routes structlog through it.
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        stream=sys.stdout,
    )
    configure_structlog()
