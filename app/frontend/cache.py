"""Provide in-process TTL caching utilities.

Use simple time-to-live caching for expensive operations
to avoid repeated backend requests and improve performance.
"""

import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

from app.frontend.config import get_settings

settings = get_settings()


@dataclass
class CacheEntry:
    """Represent a cache entry with value and expiration."""

    value: Any
    expires_at: float


class TTLCache:
    """Implement a thread-safe TTL cache."""
    
    def __init__(self, default_ttl: int = 300):
        """Initialize TTL cache.
        
        Args:
            default_ttl: Default time-to-live in seconds (5 minutes default)

        """
        self.default_ttl = default_ttl
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = threading.RLock()
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if not expired.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None if not found/expired

        """
        with self._lock:
            if key not in self._cache:
                return None
            
            entry = self._cache[key]
            
            # Check if expired
            if time.time() >= entry.expires_at:
                del self._cache[key]
                return None
            
            return entry.value
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache with TTL.
        
        Args:
            key: Cache key
            value: Value to cache
            ttl: Time-to-live in seconds (uses default if None)

        """
        if ttl is None:
            ttl = self.default_ttl
        
        expires_at = time.time() + ttl
        
        with self._lock:
            self._cache[key] = CacheEntry(value=value, expires_at=expires_at)
    
    def delete(self, key: str) -> bool:
        """Delete entry from cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if key was found and deleted, False otherwise

        """
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False
    
    def clear(self) -> None:
        """Clear all entries from cache."""
        with self._lock:
            self._cache.clear()
    
    def cleanup_expired(self) -> int:
        """Remove all expired entries.
        
        Returns:
            Number of entries removed

        """
        current_time = time.time()
        expired_keys = []
        
        with self._lock:
            for key, entry in self._cache.items():
                if current_time >= entry.expires_at:
                    expired_keys.append(key)
            
            for key in expired_keys:
                del self._cache[key]
        
        return len(expired_keys)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics.
        
        Returns:
            Dictionary with cache stats

        """
        with self._lock:
            current_time = time.time()
            total_entries = len(self._cache)
            expired_entries = sum(
                1 for entry in self._cache.values()
                if current_time >= entry.expires_at
            )
            
            return {
                "total_entries": total_entries,
                "active_entries": total_entries - expired_entries,
                "expired_entries": expired_entries,
                "default_ttl": self.default_ttl,
            }
    
    def get_or_set(
        self, 
        key: str, 
        factory: Callable[[], Any], 
        ttl: Optional[int] = None,
    ) -> Any:
        """Get value from cache or set it using factory function.
        
        Args:
            key: Cache key
            factory: Function to call if value not in cache
            ttl: Time-to-live in seconds
            
        Returns:
            Cached or computed value

        """
        # Try to get from cache first
        value = self.get(key)
        if value is not None:
            return value
        
        # Compute new value
        value = factory()
        
        # Cache the result
        self.set(key, value, ttl)
        
        return value


# Create global cache instances
_embedding_cache = TTLCache(default_ttl=settings.cache_ttl)
_system_stats_cache = TTLCache(default_ttl=60)  # 1 minute for system stats
_lora_metadata_cache = TTLCache(default_ttl=600)  # 10 minutes for LoRA metadata


def get_embedding_cache() -> TTLCache:
    """Get the embedding cache instance."""
    return _embedding_cache


def get_system_stats_cache() -> TTLCache:
    """Get the system stats cache instance."""
    return _system_stats_cache


def get_lora_metadata_cache() -> TTLCache:
    """Get the LoRA metadata cache instance."""
    return _lora_metadata_cache


# Convenience functions for common caching patterns
async def cache_embedding_stats(lora_id: str, stats_factory: Callable) -> Any:
    """Cache embedding statistics for a LoRA.
    
    Args:
        lora_id: LoRA identifier
        stats_factory: Async function to compute stats
        
    Returns:
        Cached or computed embedding stats

    """
    cache_key = f"embedding_stats:{lora_id}"
    
    # Check cache first
    cached_stats = _embedding_cache.get(cache_key)
    if cached_stats is not None:
        return cached_stats
    
    # Compute new stats
    stats = await stats_factory()
    
    # Cache the result
    _embedding_cache.set(cache_key, stats)
    
    return stats


async def cache_system_metrics(metrics_factory: Callable) -> Any:
    """Cache system metrics.
    
    Args:
        metrics_factory: Async function to compute metrics
        
    Returns:
        Cached or computed system metrics

    """
    cache_key = "system_metrics"
    
    # Check cache first
    cached_metrics = _system_stats_cache.get(cache_key)
    if cached_metrics is not None:
        return cached_metrics
    
    # Compute new metrics
    metrics = await metrics_factory()
    
    # Cache the result
    _system_stats_cache.set(cache_key, metrics)
    
    return metrics


async def cache_lora_metadata(lora_id: str, metadata_factory: Callable) -> Any:
    """Cache LoRA metadata.
    
    Args:
        lora_id: LoRA identifier
        metadata_factory: Async function to fetch metadata
        
    Returns:
        Cached or fetched LoRA metadata

    """
    cache_key = f"lora_metadata:{lora_id}"
    
    # Check cache first
    cached_metadata = _lora_metadata_cache.get(cache_key)
    if cached_metadata is not None:
        return cached_metadata
    
    # Fetch new metadata
    metadata = await metadata_factory()
    
    # Cache the result
    _lora_metadata_cache.set(cache_key, metadata)
    
    return metadata


def invalidate_lora_cache(lora_id: str) -> None:
    """Invalidate all cache entries related to a specific LoRA.
    
    Args:
        lora_id: LoRA identifier

    """
    _embedding_cache.delete(f"embedding_stats:{lora_id}")
    _lora_metadata_cache.delete(f"lora_metadata:{lora_id}")


def invalidate_system_cache() -> None:
    """Invalidate system-related cache entries."""
    _system_stats_cache.clear()


def cleanup_all_caches() -> Dict[str, int]:
    """Clean up expired entries from all caches.
    
    Returns:
        Dictionary with cleanup stats for each cache

    """
    return {
        "embedding_cache": _embedding_cache.cleanup_expired(),
        "system_stats_cache": _system_stats_cache.cleanup_expired(),
        "lora_metadata_cache": _lora_metadata_cache.cleanup_expired(),
    }


def get_all_cache_stats() -> Dict[str, Dict[str, Any]]:
    """Get statistics for all caches.
    
    Returns:
        Dictionary with stats for each cache

    """
    return {
        "embedding_cache": _embedding_cache.get_stats(),
        "system_stats_cache": _system_stats_cache.get_stats(),
        "lora_metadata_cache": _lora_metadata_cache.get_stats(),
    }


# Background cleanup task (can be called periodically)
def periodic_cache_cleanup() -> None:
    """Run periodic cleanup tasks for all caches."""
    cleanup_stats = cleanup_all_caches()
    
    # Log cleanup if any entries were removed
    total_cleaned = sum(cleanup_stats.values())
    if total_cleaned > 0:
        import logging
        logger = logging.getLogger(__name__)
        logger.debug(
            f"Cache cleanup: removed {total_cleaned} expired entries", 
            extra=cleanup_stats,
        )
