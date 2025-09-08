"""
Simple validation tests for the new modular file structure.
"""
import os
import pytest


class TestFileStructure:
    """Test that the new modular file structure exists."""
    
    def test_modular_javascript_files_exist(self):
        """Test that new modular JavaScript files have been created."""
        base_path = "app/frontend/static/js"
        
        # Test core modules
        assert os.path.exists(f"{base_path}/core/index.js")
        assert os.path.exists(f"{base_path}/utils/index.js")
        assert os.path.exists(f"{base_path}/lib/common-stub.js")
        assert os.path.exists(f"{base_path}/lib/lazy-registration.js")
        
        # Test system-admin modules
        assert os.path.exists(f"{base_path}/components/system-admin/index.js")
        assert os.path.exists(f"{base_path}/components/system-admin/api.js")
        assert os.path.exists(f"{base_path}/components/system-admin/state.js")
        assert os.path.exists(f"{base_path}/components/system-admin/metrics.js")
        assert os.path.exists(f"{base_path}/components/system-admin/backup.js")
        assert os.path.exists(f"{base_path}/components/system-admin/logs.js")
        
        # Test import-export modules
        assert os.path.exists(f"{base_path}/components/import-export/index.js")
        assert os.path.exists(f"{base_path}/components/import-export/state.js")
        assert os.path.exists(f"{base_path}/components/import-export/export.js")
        assert os.path.exists(f"{base_path}/components/import-export/import.js")
        assert os.path.exists(f"{base_path}/components/import-export/migration.js")
        assert os.path.exists(f"{base_path}/components/import-export/ui.js")
    
    def test_legacy_files_still_exist(self):
        """Test that legacy files still exist for gradual migration."""
        base_path = "app/frontend/static/js"
        
        assert os.path.exists(f"{base_path}/alpine-config.js")
        assert os.path.exists(f"{base_path}/component-loader.js")
        assert os.path.exists(f"{base_path}/components/system-admin.js")
    
    def test_backend_structure_prepared(self):
        """Test that backend modular structure is prepared."""
        # These directories should exist for future implementation
        assert os.path.exists("backend")
        assert os.path.exists("backend/api")
        assert os.path.exists("backend/services")
    
    def test_javascript_files_have_content(self):
        """Test that JavaScript files aren't empty."""
        base_path = "app/frontend/static/js"
        
        files_to_check = [
            f"{base_path}/lib/common-stub.js",
            f"{base_path}/lib/lazy-registration.js",
            f"{base_path}/components/system-admin/index.js",
            f"{base_path}/components/import-export/index.js",
            f"{base_path}/components/import-export/state.js",
            f"{base_path}/utils/index.js"
        ]
        
        for file_path in files_to_check:
            assert os.path.exists(file_path)
            with open(file_path, 'r') as f:
                content = f.read().strip()
                assert len(content) > 100, f"{file_path} seems too short or empty"
                assert "function" in content or "const" in content, f"{file_path} doesn't seem to contain JavaScript"


class TestModuleStructure:
    """Test the internal structure of modules."""
    
    def test_common_stub_exports(self):
        """Test that common-stub exports expected functions."""
        file_path = "app/frontend/static/js/lib/common-stub.js"
        with open(file_path, 'r') as f:
            content = f.read()
            assert "getCommonStub" in content
            assert "module.exports" in content or "window.getCommonStub" in content
    
    def test_lazy_registration_exports(self):
        """Test that lazy-registration exports expected functions."""  
        file_path = "app/frontend/static/js/lib/lazy-registration.js"
        with open(file_path, 'r') as f:
            content = f.read()
            assert "registerLazyComponent" in content
            assert "module.exports" in content or "window.registerLazyComponent" in content
    
    def test_system_admin_modules_have_expected_structure(self):
        """Test that system-admin modules have expected structure."""
        base_path = "app/frontend/static/js/components/system-admin"
        
        # Check that main index.js references other modules
        with open(f"{base_path}/index.js", 'r') as f:
            content = f.read()
            assert "systemAdmin" in content or "function" in content
        
        # Check that api.js has API-related content
        with open(f"{base_path}/api.js", 'r') as f:
            content = f.read()
            assert "api" in content.lower() or "fetch" in content or "http" in content
        
        # Check that state.js has state-related content  
        with open(f"{base_path}/state.js", 'r') as f:
            content = f.read()
            assert "state" in content.lower() or "data" in content
