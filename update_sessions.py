#!/usr/bin/env python3
"""Update non-dependency injection usages of get_session() to get_session_context()."""

import os
import re

# Files that need to be updated based on grep search results
files_to_update = [
    "tests/test_worker.py",
    "backend/api/v1/deliveries.py", 
    "backend/workers/tasks.py",
    "backend/services/__init__.py",
    "backend/api/v1/generation.py",
]

def update_file(filepath):
    """Update a file to use get_session_context() instead of get_session().
    
    This function replaces usage as context manager.
    """
    if not os.path.exists(filepath):
        print(f"Warning: {filepath} does not exist")
        return
        
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Check if file already imports get_session
    needs_import_update = False
    if 'from backend.core.database import get_session' in content:
        needs_import_update = True
    
    # Replace context manager usage
    original_content = content
    content = re.sub(
        r'with get_session\(\) as', 
        r'with get_session_context() as', 
        content,
    )
    
    # Update import if needed
    if needs_import_update and 'get_session_context' not in content:
        content = content.replace(
            'from backend.core.database import get_session',
            'from backend.core.database import get_session, get_session_context',
        )
    
    # Only write if changed
    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")
    else:
        print(f"No changes needed for {filepath}")

if __name__ == "__main__":
    base_path = "/home/anxilinux/DeepVault/models/Lora/lora-manager"
    os.chdir(base_path)
    
    for filepath in files_to_update:
        update_file(filepath)
