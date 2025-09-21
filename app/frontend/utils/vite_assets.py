"""Vite Asset Helper for LoRA Manager.

This module provides utilities for serving assets built by Vite,
handling both development and production environments.
"""

import json
import os
from pathlib import Path
from typing import Dict, Optional

# Configuration
VITE_DEV_SERVER = "http://localhost:5173"
VITE_MANIFEST_PATH = "dist/static/.vite/manifest.json"

def is_development() -> bool:
    """Determine if we're in development mode.
    You can customize this based on your environment setup.
    """
    # Check multiple environment indicators
    env = os.getenv("ENVIRONMENT", "development").lower()
    debug = os.getenv("DEBUG", "true").lower() in ("true", "1", "yes")
    
    # Also check if Vite dev server is running
    vite_dev_running = os.getenv("VITE_DEV_SERVER", "true").lower() in ("true", "1", "yes")
    
    return env == "development" or debug or vite_dev_running

def load_vite_manifest() -> Optional[Dict]:
    """Load the Vite manifest file if it exists.
    Returns None if the file doesn't exist or can't be parsed.
    """
    try:
        manifest_path = Path(VITE_MANIFEST_PATH)
        if manifest_path.exists():
            with open(manifest_path, "r") as f:
                return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Warning: Could not load Vite manifest: {e}")
    return None

def vite_asset(path: str) -> str:
    """Generate the correct asset path for Vite.
    
    In development, it points to the Vite dev server.
    In production, it uses the manifest file to get the hashed filename.
    
    Args:
        path: The asset path relative to the static directory (e.g., 'src/main.ts')
    
    Returns:
        The complete URL for the asset

    """
    if is_development():
        # In development, assets are served by the Vite dev server
        return f"{VITE_DEV_SERVER}/{path}"
    else:
        # In production, we need to read the manifest file
        manifest = load_vite_manifest()
        if manifest and path in manifest:
            # Get the correct file path from the manifest
            return f"/static/{manifest[path]['file']}"
        else:
            # Fallback if manifest is not found or path is not in manifest
            return f"/static/{path}"

def vite_asset_css(js_path: str) -> Optional[str]:
    """Get the corresponding CSS file for a JavaScript entry point.
    
    Args:
        js_path: The JavaScript asset path (e.g., 'src/main.ts')
    
    Returns:
        The CSS file URL if it exists, None otherwise

    """
    if is_development():
        # In development, CSS is injected by Vite
        return None
    
    manifest = load_vite_manifest()
    if manifest and js_path in manifest:
        entry = manifest[js_path]
        if "css" in entry and entry["css"]:
            # Return the first CSS file (usually there's only one)
            return f"/static/{entry['css'][0]}"
    
    return None
