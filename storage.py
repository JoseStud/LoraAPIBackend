"""Storage abstraction layer for handling file operations.

This module provides a protocol for storage operations and concrete implementations
for different storage backends (e.g., local filesystem, S3).
"""

import os
from typing import Protocol
from urllib.parse import urlparse


class Storage(Protocol):
    """A protocol for storage operations.

    Defines a common interface for checking file existence, which can be
    implemented by various storage backends.
    """

    def exists(self, path: str) -> bool:
        """Check if a file exists at the given path."""
        ...


class LocalFileSystemStorage:
    """Storage implementation for the local filesystem.

    Uses standard os module functions to interact with local files.
    """

    def exists(self, path: str) -> bool:
        """Check if a file exists and is accessible on the local filesystem.

        Args:
            path: The local file path.

        Returns:
            True if the file exists and is readable, False otherwise.

        """
        return os.path.exists(path) and os.access(path, os.R_OK)


class S3Storage:
    """Minimal S3 storage adapter using boto3.

    - Accepts `s3://bucket/key` URIs or keys relative to a configured bucket.
    - Uses HEAD Object to check existence.
    """

    def __init__(self):
        """Create an S3Storage client using configured settings.

        Import settings lazily to avoid import cycles during tests/CLI.
        """
        # Import settings lazily to avoid import cycles during tests/CLI
        from .config import settings

        # boto3 is an optional runtime dependency; import here so local-only users
        # don't fail until they opt-in to S3 storage.
        try:
            import boto3
            from botocore.exceptions import ClientError
        except Exception as exc:  # pragma: no cover - optional dependency
            raise RuntimeError(
                "boto3 is required for S3 storage but is not installed",
            ) from exc

        self._boto3 = boto3
        self._ClientError = ClientError

        self.bucket = settings.S3_BUCKET
        self.region = settings.S3_REGION
        self.endpoint_url = settings.S3_ENDPOINT_URL

        session_kwargs = {}
        if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
            session_kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
            session_kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY

        # Create a low-level client for head_object calls
        self.client = boto3.client(
            "s3",
            region_name=self.region,
            endpoint_url=self.endpoint_url,
            **session_kwargs,
        )

    def exists(self, path: str) -> bool:
        """Return True if the object exists in S3.

        Accepts full s3:// URIs or a key relative to the configured bucket.
        """
        parsed = urlparse(path)
        if parsed.scheme == "s3":
            bucket = parsed.netloc
            key = parsed.path.lstrip("/")
        else:
            # Treat path as a key within the configured bucket
            if not self.bucket:
                return False
            bucket = self.bucket
            key = path.lstrip("/")

        try:
            self.client.head_object(Bucket=bucket, Key=key)
            return True
        except self._ClientError as exc:
            # If the object does not exist S3 returns 404/403 depending on permissions.
            # Treat any 4xx as non-existence and re-raise on other issues.
            code = None
            try:
                code = int(
                    exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 0),
                )
            except Exception:
                pass
            if code and 400 <= code < 500:
                return False
            return False


def get_storage() -> Storage:
    """Return the configured storage implementation.

    Reads `config.settings.STORAGE_TYPE` and returns the matching adapter.
    """
    from .config import settings

    if settings.STORAGE_TYPE == "local":
        return LocalFileSystemStorage()
    if settings.STORAGE_TYPE == "s3":
        return S3Storage()
    # In the future, you could add other storage types here.
    raise ValueError(f"Unknown storage type: {settings.STORAGE_TYPE}")
