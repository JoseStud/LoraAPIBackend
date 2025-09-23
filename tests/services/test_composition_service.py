"""Tests for the ComposeService."""

from backend.models.adapters import Adapter
from backend.services.composition import CompositionResult


class TestComposeService:
    """Tests for the ComposeService."""

    def test_format_token(self, compose_service):
        """Test the formatting of a lora token."""
        token = compose_service.format_token("test-lora", 0.75)
        assert token == "<lora:test-lora:0.750>"

    def test_compose_from_adapter_service_builds_prompt(self, compose_service):
        """Helper should compose prompt, tokens, and warnings in one place."""
        adapters = [
            Adapter(
                name="alpha",
                file_path="/tmp/a",
                weight=0.5,
                active=True,
            ),
            Adapter(
                name="beta",
                file_path="/tmp/b",
                weight=0.75,
                active=True,
            ),
        ]

        class DummyAdapterService:
            def __init__(self, items):
                self.items = items
                self.calls = 0

            def list_active_ordered(self):
                self.calls += 1
                return self.items

        dummy_service = DummyAdapterService(adapters)

        result = compose_service.compose_from_adapter_service(
            dummy_service,
            prefix="start",
            suffix="end",
        )

        assert isinstance(result, CompositionResult)
        assert dummy_service.calls == 1
        assert result.tokens == [
            "<lora:alpha:0.500>",
            "<lora:beta:0.750>",
        ]
        assert result.prompt == "start <lora:alpha:0.500> <lora:beta:0.750> end"
        assert result.warnings == []

    def test_compose_from_adapter_service_captures_warnings(self, compose_service):
        """Warnings from validation should propagate through the helper."""
        adapters = [
            Adapter(name="gamma", file_path="/tmp/a", weight=0.0, active=True),
            Adapter(name="gamma", file_path="/tmp/b", weight=0.0, active=True),
        ]

        class DummyAdapterService:
            def list_active_ordered(self):
                return adapters

        result = compose_service.compose_from_adapter_service(
            DummyAdapterService(),
            prefix="start",
            suffix="end",
        )

        assert "Duplicate adapter names" in " ".join(result.warnings)
        assert "Adapters with zero weight" in " ".join(result.warnings)
        assert result.prompt == "start <lora:gamma:0.000> <lora:gamma:0.000> end"

    def test_validate_adapters_reports_each_duplicate_once(self, compose_service):
        """Duplicate adapter warnings should enumerate each repeated name once."""
        adapters = [
            Adapter(name="alpha", file_path="/tmp/a", weight=0.5, active=True),
            Adapter(name="beta", file_path="/tmp/b", weight=0.6, active=True),
            Adapter(name="alpha", file_path="/tmp/c", weight=0.7, active=True),
            Adapter(name="beta", file_path="/tmp/d", weight=0.8, active=True),
            Adapter(name="gamma", file_path="/tmp/e", weight=0.9, active=True),
        ]

        warnings = compose_service.validate_adapters(adapters)

        assert "Duplicate adapter names found: alpha, beta" in warnings
