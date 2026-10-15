"""Delivery system registry setup.

Importing this package has no side effects. The built-in delivery and
generation backends are registered by :func:`ensure_delivery_system`, which
the application lifespan and worker start-up call explicitly. Every other
caller reaches the registry through :func:`get_delivery_registry`, which
performs the same idempotent registration on first use.
"""

from __future__ import annotations

import threading

from backend.core.config import settings

from .base import DeliveryBackend, DeliveryRegistry, GenerationBackend
from .cli import CLIDeliveryBackend
from .http import HTTPDeliveryBackend
from .http_client import DeliveryHTTPClient
from .sdnext import SDNextGenerationBackend
from .sdnext_client import SDNextSession
from .storage import FileSystemImageStorage

_registry = DeliveryRegistry()
_registry_lock = threading.Lock()
_registry_initialized = False


def _register_builtin_backends(registry: DeliveryRegistry) -> None:
    """Register the HTTP/CLI delivery backends and the SDNext generation backend."""
    registry.register_delivery_backend("http", HTTPDeliveryBackend())
    registry.register_delivery_backend("cli", CLIDeliveryBackend())

    http_client = DeliveryHTTPClient(
        settings.SDNEXT_BASE_URL,
        timeout=settings.SDNEXT_TIMEOUT,
        username=settings.SDNEXT_USERNAME,
        password=settings.SDNEXT_PASSWORD,
    )
    storage = FileSystemImageStorage(settings.SDNEXT_OUTPUT_DIR)
    sdnext_session = SDNextSession(http_client)
    registry.register_generation_backend(
        "sdnext",
        SDNextGenerationBackend(
            session=sdnext_session,
            storage=storage,
        ),
    )


def ensure_delivery_system() -> DeliveryRegistry:
    """Register the built-in backends once and return the shared registry.

    Safe to call repeatedly and from several threads: registration happens
    exactly once per process, using the settings in effect at that moment.
    """
    global _registry_initialized
    if _registry_initialized:
        return _registry
    with _registry_lock:
        if not _registry_initialized:
            _register_builtin_backends(_registry)
            _registry_initialized = True
    return _registry


def get_delivery_registry() -> DeliveryRegistry:
    """Return the shared delivery registry, registering built-ins if needed."""
    return ensure_delivery_system()


def get_delivery_backend(name: str) -> DeliveryBackend:
    """Get a delivery backend by name.

    Args:
        name: Backend name

    Returns:
        Backend instance

    Raises:
        ValueError: If backend not found

    """
    backend = get_delivery_registry().get_delivery_backend(name)
    if backend is None:
        raise ValueError(f"Delivery backend '{name}' not found")
    return backend


def get_generation_backend(name: str) -> GenerationBackend:
    """Get a generation backend by name.

    Args:
        name: Backend name

    Returns:
        Backend instance

    Raises:
        ValueError: If backend not found

    """
    backend = get_delivery_registry().get_generation_backend(name)
    if backend is None:
        raise ValueError(f"Generation backend '{name}' not found")
    return backend


__all__ = [
    "DeliveryBackend",
    "DeliveryRegistry",
    "GenerationBackend",
    "ensure_delivery_system",
    "get_delivery_backend",
    "get_delivery_registry",
    "get_generation_backend",
]
