"""Delivery system initialization and registry setup."""

from .base import DeliveryBackend, GenerationBackend, delivery_registry
from .cli import CLIDeliveryBackend
from .http import HTTPDeliveryBackend
from .sdnext import SDNextGenerationBackend


def initialize_delivery_system() -> None:
    """Initialize and register all delivery backends."""
    # Register delivery backends
    delivery_registry.register_delivery_backend("http", HTTPDeliveryBackend())
    delivery_registry.register_delivery_backend("cli", CLIDeliveryBackend())
    
    # Register generation backends
    delivery_registry.register_generation_backend("sdnext", SDNextGenerationBackend())


def get_delivery_backend(name: str) -> DeliveryBackend:
    """Get a delivery backend by name.
    
    Args:
        name: Backend name
        
    Returns:
        Backend instance
        
    Raises:
        ValueError: If backend not found

    """
    backend = delivery_registry.get_delivery_backend(name)
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
    backend = delivery_registry.get_generation_backend(name)
    if backend is None:
        raise ValueError(f"Generation backend '{name}' not found")
    return backend


# Initialize on import
initialize_delivery_system()
