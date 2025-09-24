"""Regression tests for the Vue-only frontend architecture."""

from __future__ import annotations

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = PROJECT_ROOT / "app" / "frontend"
VUE_SRC = FRONTEND_DIR / "src"


class TestFrontendStructure:
    """Validate that the Vue SPA supersedes the legacy Alpine implementation."""

    def test_vue_spa_files_exist(self) -> None:
        """Key Vue SPA entry points should exist for every build."""
        assert (VUE_SRC / "App.vue").is_file()
        assert (VUE_SRC / "main.ts").is_file()
        assert (VUE_SRC / "router" / "index.ts").is_file()
        assert (FRONTEND_DIR / "index.html").is_file()

    def test_legacy_alpine_assets_removed(self) -> None:
        """The old Alpine/HTMX bundles must be removed once Vue owns the UI."""
        legacy_root = FRONTEND_DIR / "static" / "js"
        assert not legacy_root.exists(), "legacy Alpine bundles should be removed"

    def test_python_frontend_package_removed(self) -> None:
        """Historical Python frontend modules should no longer exist."""

        legacy_modules = [
            FRONTEND_DIR / "__init__.py",
            FRONTEND_DIR / "config.py",
            FRONTEND_DIR / "cache.py",
            FRONTEND_DIR / "errors.py",
            FRONTEND_DIR / "schemas.py",
            FRONTEND_DIR / "logging.py",
            FRONTEND_DIR / "utils",
        ]

        for module in legacy_modules:
            message = f"{module} should be removed with the SPA migration"
            assert not module.exists(), message

    def test_vue_views_cover_workflows(self) -> None:
        """Ensure that workflow views include the core feature components."""
        workflows = {
            "DashboardView.vue": {
                "SystemStatusCard",
                "JobQueue",
                "PromptComposer",
                "GenerationStudio",
                "GenerationHistory",
                "RecommendationsPanel",
                "LoraGallery",
                "ImportExport",
            },
            "GenerateView.vue": {
                "SystemStatusCard",
                "JobQueue",
                "GenerationStudio",
                "RecommendationsPanel",
            },
            "ComposeView.vue": {
                "PromptComposer",
                "GenerationHistory",
            },
            "HistoryView.vue": {
                "SystemStatusCard",
                "JobQueue",
                "GenerationHistory",
            },
            "LorasView.vue": {"LoraGallery"},
            "RecommendationsView.vue": {"RecommendationsPanel"},
        }

        for view_name, required_components in workflows.items():
            view_path = VUE_SRC / "views" / view_name
            content = view_path.read_text(encoding="utf-8")
            for component in required_components:
                assert f"<{component}" in content, (
                    f"{component} missing from {view_name}"
                )

    def test_app_shell_uses_router_view(self) -> None:
        """The root shell should delegate routing to the Vue router."""
        app_shell = (VUE_SRC / "App.vue").read_text(encoding="utf-8")
        assert "<RouterView />" in app_shell


class TestPackageMetadata:
    """Keep package metadata aligned with the Vue-only implementation."""

    def test_package_keywords_drop_legacy_terms(self) -> None:
        package_json = (PROJECT_ROOT / "package.json").read_text(encoding="utf-8")
        assert "alpine" not in package_json
        assert "htmx" not in package_json
