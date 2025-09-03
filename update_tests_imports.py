#!/usr/bin/env python3
"""
Script to update all import statements in test files
from 'app.' to 'backend.' to reflect the new project structure
"""

import os
import re
from pathlib import Path

def update_imports_in_file(file_path):
    """Update imports in a single Python file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Update various import patterns
        patterns = [
            # from app.something import
            (r'from app\.', 'from backend.'),
            # import app.something
            (r'import app\.', 'import backend.'),
        ]
        
        for pattern, replacement in patterns:
            content = re.sub(pattern, replacement, content)
        
        # Only write if content changed
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Updated imports in: {file_path}")
            return True
        
        return False
        
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return False

def main():
    """Update all Python files in the tests directory"""
    tests_dir = Path("/home/anxilinux/DeepVault/models/Lora/lora-manager/tests")
    scripts_dir = Path("/home/anxilinux/DeepVault/models/Lora/lora-manager/scripts")
    
    updated_files = []
    
    # Update test files
    if tests_dir.exists():
        for py_file in tests_dir.rglob("*.py"):
            if py_file.is_file():
                if update_imports_in_file(py_file):
                    updated_files.append(str(py_file))
    
    # Update script files
    if scripts_dir.exists():
        for py_file in scripts_dir.rglob("*.py"):
            if py_file.is_file():
                if update_imports_in_file(py_file):
                    updated_files.append(str(py_file))
    
    print(f"\nUpdated {len(updated_files)} files:")
    for file in updated_files:
        print(f"  - {file}")
    
    if not updated_files:
        print("No files needed updating!")

if __name__ == "__main__":
    main()
