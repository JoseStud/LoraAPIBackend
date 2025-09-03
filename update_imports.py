#!/usr/bin/env python3
"""
Script to update import paths from 'app.' to 'backend.' in test files
"""

import os
import re
from pathlib import Path

def update_imports_in_file(file_path):
    """Update imports from app. to backend. in a single file"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace import patterns
    # from app.something import ...
    content = re.sub(r'from app\.', 'from backend.', content)
    # import app.something
    content = re.sub(r'import app\.', 'import backend.', content)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Updated imports in {file_path}")

def main():
    """Main function to update all test files"""
    test_dir = Path("tests")
    
    if not test_dir.exists():
        print("tests directory not found")
        return
    
    # Find all Python files in tests directory
    for py_file in test_dir.rglob("*.py"):
        update_imports_in_file(py_file)
    
    print("All test imports updated successfully!")

if __name__ == "__main__":
    main()
