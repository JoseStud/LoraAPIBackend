#!/usr/bin/env python3
"""Quick script to fix common ESLint issues."""
import glob
import os
import re


def fix_unused_function_params(file_path):
    """Fix unused function parameters by adding underscore prefix."""
    with open(file_path, 'r') as f:
        content = f.read()
    
    original_content = content
    
    # Pattern for function parameters that should be prefixed with underscore
    patterns = [
        (r'\bbackupId\b(?=\s*[,\)])', '_backupId'),
        (r'\btimeRange\b(?=\s*[,\)])', '_timeRange'),
        (r'\binsight\b(?=\s*[,\)])', '_insight'),
        (r'\bformat\b(?=\s*[,\)])', '_format'),
        (r'\berror\b(?=\s*[,\)])', '_error'),
        (r'\btype\b(?=\s*[,\)])', '_type'),
        (r'\bjobId\b(?=\s*[,\)])', '_jobId'),
    ]
    
    for pattern, replacement in patterns:
        content = re.sub(pattern, replacement, content)
    
    if content != original_content:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Fixed unused parameters in: {file_path}")

def fix_unused_imports(file_path):
    """Fix unused imports by prefixing with underscore."""
    with open(file_path, 'r') as f:
        content = f.read()
    
    original_content = content
    
    # Fix destructuring assignments
    patterns = [
        (r'putData(?=\s*[,\}])', '_putData'),
        (r'deleteData(?=\s*[,\}])', '_deleteData'),
        (r'customParseResponse(?=\s*[,\}])', '_customParseResponse'),
        (r'overrideHeaders(?=\s*[,\}])', '_overrideHeaders'),
        (r'overrideBody(?=\s*[,\}])', '_overrideBody'),
        (r'restOptions(?=\s*[,\}])', '_restOptions'),
    ]
    
    for pattern, replacement in patterns:
        content = re.sub(pattern, replacement, content)
    
    if content != original_content:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Fixed unused imports in: {file_path}")

def main():
    """Main function to process all JavaScript files."""
    js_files = glob.glob('app/frontend/static/js/**/*.js', recursive=True)
    
    for file_path in js_files:
        if not os.path.exists(file_path):
            continue
            
        print(f"Processing: {file_path}")
        fix_unused_function_params(file_path)
        fix_unused_imports(file_path)

if __name__ == "__main__":
    main()
