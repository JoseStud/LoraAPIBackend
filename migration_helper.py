#!/usr/bin/env python3
"""Migration helper for validating the Vue SPA takeover."""

from pathlib import Path
from typing import Dict, List

# Base directory for the project
PROJECT_ROOT = Path(__file__).parent

# Mapping of retired Alpine features to their Vue counterparts
FILE_MIGRATION_MAP: Dict[str, List[str]] = {
    "System administration dashboard": [
        "app/frontend/src/components/SystemAdminStatusCard.vue",
        "app/frontend/src/components/SystemStatusPanel.vue",
        "app/frontend/src/components/JobQueue.vue",
    ],
    "Import/export workflows": [
        "app/frontend/src/components/ImportExport.vue",
        "app/frontend/src/views/ImportExportView.vue",
    ],
    "Analytics overview": [
        "app/frontend/src/views/analytics/PerformanceAnalyticsPage.vue",
    ],
    "Offline messaging": [
        "app/frontend/src/components/OfflineFeatureCard.vue",
        "app/frontend/src/views/OfflineView.vue",
    ],
}


def backup_original_files() -> None:
    """Legacy helper retained for compatibility."""
    print("Legacy Alpine bundles have already been removed; nothing to back up.")


def check_new_files() -> Dict[str, List[str]]:
    """Check which new modular files exist."""
    status = {}
    
    for feature, new_files in FILE_MIGRATION_MAP.items():
        status[feature] = []

        for new_file in new_files:
            file_path = PROJECT_ROOT / new_file
            if file_path.exists():
                status[feature].append(f"✓ {new_file}")
            else:
                status[feature].append(f"✗ {new_file}")

    return status


def print_migration_status() -> None:
    """Print current migration status."""
    print("\n" + "="*60)
    print("MIGRATION STATUS")
    print("="*60)
    
    status = check_new_files()
    
    for feature, file_statuses in status.items():
        print(f"\n{feature}:")
        for file_status in file_statuses:
            print(f"  {file_status}")

    print("\n" + "-"*60)
    print("VUE COMPONENT COVERAGE")
    print("-"*60)

    for feature, new_files in FILE_MIGRATION_MAP.items():
        all_exist = all((PROJECT_ROOT / new_file).exists() for new_file in new_files)

        if all_exist:
            print(f"✓ {feature} - Vue components present")
        else:
            missing = [f for f in new_files if not (PROJECT_ROOT / f).exists()]
            print(f"✗ {feature} - Missing: {', '.join(missing)}")


def update_template_imports(dry_run: bool = True) -> None:
    """Update template files to use new modular imports."""
    templates_dir = PROJECT_ROOT / "app/frontend/templates"
    
    if not templates_dir.exists():
        print("Templates directory not found")
        return
    
    # Mapping of old script includes to new ones
    import_updates: Dict[str, List[str] | str] = {}
    
    print(f"\n{'DRY RUN: ' if dry_run else ''}Updating template imports...")
    
    for template_file in templates_dir.rglob("*.html"):
        content = template_file.read_text()
        updated_content = content
        updated = False
        
        for old_import, new_import in import_updates.items():
            if old_import in content:
                if isinstance(new_import, list):
                    # Replace with multiple imports
                    old_tag = (
                        f'<script src="{{ url_for(\'static\', '
                        f'path=\'{old_import}\') }}"></script>'
                    )
                    new_tags = '\n'.join([
                        f'<script src="{{ url_for(\'static\', '
                        f'path=\'{ni}\') }}"></script>'
                        for ni in new_import
                    ])
                    updated_content = updated_content.replace(old_tag, new_tags)
                else:
                    # Replace with single import
                    updated_content = updated_content.replace(old_import, new_import)
                
                updated = True
                print(
                    f"  {'[DRY] ' if dry_run else ''}"
                    f"Updated {template_file.relative_to(PROJECT_ROOT)}",
                )
        
        if updated and not dry_run:
            template_file.write_text(updated_content)


def create_integration_test() -> None:
    """This helper is no longer required now that the Vue SPA is canonical."""
    print("Vue integration tests live under tests/unit and tests/e2e; no legacy scaffold created.")


def main():
    """Run the main migration helper process."""
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
