"""Storage helpers for handling file operations on the local filesystem."""

import os


def file_exists(path: str) -> bool:
    """Check if a file exists and is accessible on the local filesystem.

    Args:
        path: The local file path.

    Returns:
        True if the file exists and is readable, False otherwise.

    """
    return os.path.exists(path) and os.access(path, os.R_OK)
