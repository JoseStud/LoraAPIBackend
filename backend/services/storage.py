"""Storage service for local filesystem interactions."""

import os
from pathlib import Path
from typing import List, Optional, Protocol


class StorageBackend(Protocol):
    """Protocol for storage backend implementations."""

    def file_exists(self, path: str) -> bool:
        """Check if a file exists.

        Args:
            path: File path to check

        Returns:
            True if file exists

        """
        ...

    def get_file_size(self, path: str) -> Optional[int]:
        """Get file size in bytes.

        Args:
            path: File path

        Returns:
            File size in bytes or None if file doesn't exist

        """
        ...

    def list_files(self, directory: str, pattern: str = "*") -> List[str]:
        """List files in a directory matching pattern.

        Args:
            directory: Directory to search
            pattern: File pattern (glob)

        Returns:
            List of file paths

        """
        ...


class LocalFileSystemStorage:
    """Local filesystem storage backend."""

    def file_exists(self, path: str) -> bool:
        """Check if a file exists on local filesystem.

        Args:
            path: File path to check

        Returns:
            True if file exists and is readable

        """
        return os.path.isfile(path) and os.access(path, os.R_OK)

    def get_file_size(self, path: str) -> Optional[int]:
        """Get file size in bytes.

        Args:
            path: File path

        Returns:
            File size in bytes or None if file doesn't exist

        """
        try:
            return os.path.getsize(path)
        except (OSError, FileNotFoundError):
            return None

    def list_files(self, directory: str, pattern: str = "*") -> List[str]:
        """List files in directory matching pattern.

        Args:
            directory: Directory to search
            pattern: File pattern (glob)

        Returns:
            List of file paths

        """
        try:
            dir_path = Path(directory)
            if not dir_path.exists() or not dir_path.is_dir():
                return []

            return [str(p) for p in dir_path.glob(pattern) if p.is_file()]
        except Exception:
            return []


class StorageService:
    """Service for managing storage operations."""

    def __init__(self, backend: StorageBackend):
        """Initialize storage service with a backend.

        Args:
            backend: Storage backend implementation

        """
        self.backend = backend

    def validate_file_path(self, path: str) -> bool:
        """Validate that a file path exists and is accessible.

        Args:
            path: File path to validate

        Returns:
            True if file is valid

        """
        return self.backend.file_exists(path)

    def get_file_info(self, path: str) -> Optional[dict]:
        """Get file information.

        Args:
            path: File path

        Returns:
            Dict with file info or None if file doesn't exist

        """
        if not self.backend.file_exists(path):
            return None

        size = self.backend.get_file_size(path)
        return {
            "path": path,
            "size": size,
            "exists": True,
        }

    def discover_lora_files(self, directory: str) -> List[str]:
        """Discover LoRA files in a directory.

        Args:
            directory: Directory to search

        Returns:
            List of LoRA file paths

        """
        lora_files = []

        # Common LoRA file extensions
        patterns = ["*.safetensors", "*.ckpt", "*.pt", "*.pth"]

        for pattern in patterns:
            files = self.backend.list_files(directory, pattern)
            lora_files.extend(files)

        return sorted(set(lora_files))  # Remove duplicates and sort


def get_storage_backend() -> StorageBackend:
    """Return the supported storage backend implementation.

    The application currently supports only the local filesystem for storage,
    so this helper always returns :class:`LocalFileSystemStorage`.

    Returns:
        LocalFileSystemStorage: The local filesystem storage backend instance.

    """
    return LocalFileSystemStorage()


def get_storage_service() -> StorageService:
    """Get a storage service instance.

    Returns:
        StorageService with configured backend

    """
    return StorageService(get_storage_backend())
