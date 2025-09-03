"""Storage service with enhanced backend abstraction."""

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


class S3StorageBackend:
    """S3/MinIO storage backend (placeholder implementation)."""
    
    def __init__(self, bucket_name: str, endpoint_url: Optional[str] = None):
        """Initialize S3 storage backend.
        
        Args:
            bucket_name: S3 bucket name
            endpoint_url: Custom S3 endpoint (for MinIO)

        """
        self.bucket_name = bucket_name
        self.endpoint_url = endpoint_url
        # TODO: Initialize boto3 client
    
    def file_exists(self, path: str) -> bool:
        """Check if object exists in S3 bucket.
        
        Args:
            path: Object key/path
            
        Returns:
            True if object exists

        """
        # TODO: Implement S3 object existence check
        raise NotImplementedError("S3 backend not yet implemented")
    
    def get_file_size(self, path: str) -> Optional[int]:
        """Get object size in S3.
        
        Args:
            path: Object key/path
            
        Returns:
            Object size in bytes or None if not found

        """
        # TODO: Implement S3 object size check
        raise NotImplementedError("S3 backend not yet implemented")
    
    def list_files(self, directory: str, pattern: str = "*") -> List[str]:
        """List objects in S3 bucket with prefix.
        
        Args:
            directory: Key prefix
            pattern: Pattern filter (basic support)
            
        Returns:
            List of object keys

        """
        # TODO: Implement S3 object listing
        raise NotImplementedError("S3 backend not yet implemented")


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
    """Get the configured storage backend.
    
    Returns:
        Configured storage backend instance

    """
    # For now, always return local filesystem
    # TODO: Add configuration-based backend selection
    return LocalFileSystemStorage()


def get_storage_service() -> StorageService:
    """Get a storage service instance.
    
    Returns:
        StorageService with configured backend

    """
    return StorageService(get_storage_backend())
