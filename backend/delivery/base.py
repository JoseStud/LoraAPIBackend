"""Abstract base classes and interfaces for delivery system."""

import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

from backend.schemas.generation import SDNextGenerationResult

logger = logging.getLogger(__name__)


class DeliveryBackend(ABC):
    """Abstract base class for delivery backends."""

    @abstractmethod
    async def deliver(self, prompt: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Deliver the prompt using this backend.

        Args:
            prompt: The composed prompt to deliver
            params: Backend-specific parameters

        Returns:
            Dict containing delivery result

        """
        pass

    @abstractmethod
    def get_backend_name(self) -> str:
        """Return the name of this delivery backend."""
        pass


class GenerationBackend(ABC):
    """Abstract base class for image generation backends."""

    @abstractmethod
    async def generate_image(
        self, prompt: str, params: Dict[str, Any]
    ) -> SDNextGenerationResult:
        """Generate an image using this backend.

        Args:
            prompt: The composed prompt for generation
            params: Generation parameters

        Returns:
            SDNextGenerationResult with job status and results

        """
        pass

    @abstractmethod
    async def check_progress(self, job_id: str) -> SDNextGenerationResult:
        """Check generation progress for a job.

        Args:
            job_id: The generation job ID

        Returns:
            SDNextGenerationResult with current status

        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this backend is available and configured."""
        pass

    async def interrupt(self) -> bool:
        """Stop the generation in progress; ``False`` when not supported."""
        return False

    async def release_loop_resources(self) -> None:
        """Release resources bound to the running event loop (HTTP sessions).

        Called before a short-lived loop (an ``asyncio.run`` in a worker)
        ends. Backends without loop-bound resources keep this no-op.
        """
        return None


class DeliveryRegistry:
    """Registry for delivery and generation backends."""

    def __init__(self):
        """Initialize the registry."""
        self._delivery_backends: Dict[str, DeliveryBackend] = {}
        self._generation_backends: Dict[str, GenerationBackend] = {}

    def register_delivery_backend(self, name: str, backend: DeliveryBackend) -> None:
        """Register a delivery backend.

        Args:
            name: Backend name (e.g., "http", "cli")
            backend: Backend instance

        """
        self._delivery_backends[name] = backend

    def register_generation_backend(
        self, name: str, backend: GenerationBackend
    ) -> None:
        """Register a generation backend.

        Args:
            name: Backend name (e.g., "sdnext")
            backend: Backend instance

        """
        self._generation_backends[name] = backend

    def get_delivery_backend(self, name: str) -> Optional[DeliveryBackend]:
        """Get a delivery backend by name.

        Args:
            name: Backend name

        Returns:
            Backend instance or None if not found

        """
        return self._delivery_backends.get(name)

    def get_generation_backend(self, name: str) -> Optional[GenerationBackend]:
        """Get a generation backend by name.

        Args:
            name: Backend name

        Returns:
            Backend instance or None if not found

        """
        return self._generation_backends.get(name)

    async def release_loop_resources(self) -> None:
        """Let every generation backend release what it holds for this loop."""
        for name, backend in list(self._generation_backends.items()):
            try:
                await backend.release_loop_resources()
            except Exception:  # pragma: no cover - defensive guard
                logger.warning(
                    "Releasing loop resources of %s failed", name, exc_info=True
                )

    def list_available_backends(self) -> Dict[str, Dict[str, bool]]:
        """List all registered backends and their availability.

        Returns:
            Dict mapping backend types to backend names and availability

        """
        return {
            "delivery": {name: True for name in self._delivery_backends.keys()},
            "generation": {
                name: backend.is_available()
                for name, backend in self._generation_backends.items()
            },
        }
