#!/usr/bin/env python3
"""Migration Helper Script

Helps migrate from monolithic files to the new modular structure.
This script can be used to gradually transition components.
"""

import shutil
from pathlib import Path
from typing import Dict, List

# Base directory for the project
PROJECT_ROOT = Path(__file__).parent

# Mapping of old files to new modular structure
FILE_MIGRATION_MAP = {
    # System Admin Component
    "app/frontend/static/js/system-admin.js": [
        "app/frontend/static/js/components/system-admin/index.js",
        "app/frontend/static/js/components/system-admin/api.js", 
        "app/frontend/static/js/components/system-admin/state.js",
        "app/frontend/static/js/components/system-admin/metrics.js",
        "app/frontend/static/js/components/system-admin/backup.js",
        "app/frontend/static/js/components/system-admin/logs.js",
    ],
    
    # Component Loader
    "app/frontend/static/js/component-loader.js": [
        "app/frontend/static/js/core/component-loader/core.js",
        "app/frontend/static/js/core/component-loader/registry.js",
        "app/frontend/static/js/core/component-loader/stubs.js",
        "app/frontend/static/js/core/component-loader/logger.js",
    ],
    
    # Alpine Config - dependencies removed after refactoring to apiDataFetcher
    "app/frontend/static/js/alpine-config.js": [
        # No longer dependent on lib files after cleanup
    ],
    
    # Backend Routes
    "app/frontend/routes_fastapi.py": [
        "app/frontend/routes/pages.py",
        "app/frontend/routes/htmx.py", 
        "app/frontend/routes/sw.py",
        "app/frontend/utils/http.py",
    ],
}


def backup_original_files() -> None:
    """Create backups of original files before migration"""
    backup_dir = PROJECT_ROOT / "migration_backup"
    backup_dir.mkdir(exist_ok=True)
    
    print("Creating backups of original files...")
    
    for original_file in FILE_MIGRATION_MAP.keys():
        file_path = PROJECT_ROOT / original_file
        if file_path.exists():
            backup_path = backup_dir / file_path.name
            shutil.copy2(file_path, backup_path)
            print(f"  Backed up: {original_file} -> {backup_path}")
        else:
            print(f"  Warning: Original file not found: {original_file}")


def check_new_files() -> Dict[str, List[str]]:
    """Check which new modular files exist"""
    status = {}
    
    for original_file, new_files in FILE_MIGRATION_MAP.items():
        status[original_file] = []
        
        for new_file in new_files:
            file_path = PROJECT_ROOT / new_file
            if file_path.exists():
                status[original_file].append(f"✓ {new_file}")
            else:
                status[original_file].append(f"✗ {new_file}")
    
    return status


def print_migration_status() -> None:
    """Print current migration status"""
    print("\n" + "="*60)
    print("MIGRATION STATUS")
    print("="*60)
    
    status = check_new_files()
    
    for original_file, file_statuses in status.items():
        print(f"\n{original_file}:")
        for file_status in file_statuses:
            print(f"  {file_status}")
    
    # Check if original files can be safely removed
    print("\n" + "-"*60)
    print("MIGRATION READINESS")
    print("-"*60)
    
    for original_file, new_files in FILE_MIGRATION_MAP.items():
        file_path = PROJECT_ROOT / original_file
        
        if not file_path.exists():
            print(f"✓ {original_file} - Already migrated")
            continue
        
        # Check if all new files exist
        all_exist = all((PROJECT_ROOT / new_file).exists() for new_file in new_files)
        
        if all_exist:
            print(f"✓ {original_file} - Ready for migration (all modules created)")
        else:
            missing = [f for f in new_files if not (PROJECT_ROOT / f).exists()]
            print(f"✗ {original_file} - Missing modules: {', '.join(missing)}")


def update_template_imports(dry_run: bool = True) -> None:
    """Update template files to use new modular imports"""
    templates_dir = PROJECT_ROOT / "app/frontend/templates"
    
    if not templates_dir.exists():
        print("Templates directory not found")
        return
    
    # Mapping of old script includes to new ones
    import_updates = {
        'static/js/system-admin.js': 'static/js/components/system-admin/index.js',
        'static/js/component-loader.js': 'static/js/core/index.js',
        # alpine-config.js no longer needs lib dependencies after cleanup
    }
    
    print(f"\n{'DRY RUN: ' if dry_run else ''}Updating template imports...")
    
    for template_file in templates_dir.rglob("*.html"):
        content = template_file.read_text()
        updated_content = content
        updated = False
        
        for old_import, new_import in import_updates.items():
            if old_import in content:
                if isinstance(new_import, list):
                    # Replace with multiple imports
                    old_tag = f'<script src="{{ url_for(\'static\', path=\'{old_import}\') }}"></script>'
                    new_tags = '\n'.join([
                        f'<script src="{{ url_for(\'static\', path=\'{ni}\') }}"></script>'
                        for ni in new_import
                    ])
                    updated_content = updated_content.replace(old_tag, new_tags)
                else:
                    # Replace with single import
                    updated_content = updated_content.replace(old_import, new_import)
                
                updated = True
                print(f"  {'[DRY] ' if dry_run else ''}Updated {template_file.relative_to(PROJECT_ROOT)}")
        
        if updated and not dry_run:
            template_file.write_text(updated_content)


def create_integration_test() -> None:
    """Create a simple integration test to verify the migration"""
    test_content = '''
/**
 * Integration test for migrated components
 * 
 * Run this test to verify that all migrated components
 * work correctly together.
 */

// Test that all new modules can be imported
describe('Migration Integration Tests', () => {
    test('system-admin modules can be imported', () => {
        expect(() => {
            require('../app/frontend/static/js/components/system-admin/api.js');
            require('../app/frontend/static/js/components/system-admin/state.js');
        }).not.toThrow();
    });

    test('component-loader modules can be imported', () => {
        expect(() => {
            require('../app/frontend/static/js/core/component-loader/core.js');
            require('../app/frontend/static/js/core/component-loader/registry.js');
        }).not.toThrow();
    });

    test('common utilities are available', () => {
        expect(() => {
            require('../app/frontend/static/js/utils/index.js');
        }).not.toThrow();
    });
});
'''
    
    test_file = PROJECT_ROOT / "tests/integration/migration.test.js"
    test_file.parent.mkdir(parents=True, exist_ok=True)
    test_file.write_text(test_content.strip())
    print(f"Created integration test: {test_file}")


def main():
    """Main migration helper function"""
    print("LoRA Manager Frontend Migration Helper")
    print("="*50)
    
    # Always check status first
    print_migration_status()
    
    print("\nAvailable commands:")
    print("1. backup - Create backups of original files")
    print("2. status - Show migration status (default)")
    print("3. templates - Update template imports (dry run)")
    print("4. templates-apply - Apply template import updates")
    print("5. test - Create integration test")
    print("6. all - Run backup, templates-apply, and test")
    
    try:
        choice = input("\nEnter command (or press Enter for status): ").strip().lower()
    except KeyboardInterrupt:
        print("\nAborted.")
        return
    
    if choice == "backup" or choice == "1":
        backup_original_files()
    elif choice == "templates" or choice == "3":
        update_template_imports(dry_run=True)
    elif choice == "templates-apply" or choice == "4":
        update_template_imports(dry_run=False)
    elif choice == "test" or choice == "5":
        create_integration_test()
    elif choice == "all" or choice == "6":
        backup_original_files()
        update_template_imports(dry_run=False)
        create_integration_test()
        print("\nMigration preparation complete!")
    elif choice == "status" or choice == "2" or choice == "":
        pass  # Status already shown
    else:
        print(f"Unknown command: {choice}")


if __name__ == "__main__":
    main()
