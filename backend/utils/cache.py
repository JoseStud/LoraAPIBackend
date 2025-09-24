"""In-memory TTL cache for tests and lightweight caching use-cases."""

from __future__ import annotations

import time
from threading import RLock
from typing import Any, Dict, Optional, Tuple


class TTLCache:
    """A simple thread-safe in-memory TTL cache.

    - default_ttl: seconds to keep items unless per-item ttl is provided
    - set(key, value, ttl=None): store value with TTL override
    - get(key, default=None): return value or default if missing/expired
    - clear(): remove all entries
    - len(cache): non-expired entry count
    """

    def __init__(self, default_ttl: float = 60.0) -> None:
        """Initialise the cache with a default time-to-live in seconds."""
        if not isinstance(default_ttl, (int, float)) or default_ttl <= 0:
            raise ValueError("default_ttl must be a positive number")
        self._default_ttl = float(default_ttl)
        self._data: Dict[Any, Tuple[Any, float]] = {}
        self._lock = RLock()

    def _now(self) -> float:
        return time.monotonic()

    def _expired(self, exp: float) -> bool:
        return self._now() >= exp

    def set(self, key: Any, value: Any, ttl: Optional[float] = None) -> None:
        """Store ``value`` under ``key`` using either the provided or default TTL."""
        ttl_val = float(ttl if ttl is not None else self._default_ttl)
        if ttl_val <= 0:
            with self._lock:
                self._data.pop(key, None)
            return
        exp = self._now() + ttl_val
        with self._lock:
            self._data[key] = (value, exp)

    def get(self, key: Any, default: Any = None) -> Any:
        """Return the cached value for ``key`` or ``default`` when absent/expired."""
        with self._lock:
            item = self._data.get(key)
            if not item:
                return default
            value, exp = item
            if self._expired(exp):
                self._data.pop(key, None)
                return default
            return value

    def clear(self) -> None:
        """Remove all entries from the cache."""
        with self._lock:
            self._data.clear()

    def __len__(self) -> int:  # pragma: no cover
        """Return the count of non-expired entries in the cache."""
        with self._lock:
            now = self._now()
            # prune
            self._data = {k: v for k, v in self._data.items() if now < v[1]}
            return len(self._data)


__all__ = ["TTLCache"]
