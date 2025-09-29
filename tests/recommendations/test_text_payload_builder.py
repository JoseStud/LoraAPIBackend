"""Unit tests for the multi-modal text payload builder."""

from __future__ import annotations

import dataclasses

import pytest

from backend.services.recommendations.components.text_payload_builder import (
    MultiModalTextPayloadBuilder,
)


@dataclasses.dataclass
class _Adapter:
    """Simple adapter fixture used to exercise payload generation."""

    trained_words: tuple[str, ...] = ("angelic", "ethereal light")
    triggers: tuple[str, ...] = ("angel", "wings")
    activation_text: str | None = "celestial aura"
    tags: tuple[str, ...] = ("fantasy", "angel", "portrait")
    archetype: str | None = "heavenly guardian"
    description: str | None = None


class _DescriptionGuardAdapter(_Adapter):
    """Adapter that raises when ``description`` is accessed."""

    @property
    def description(self) -> str:  # type: ignore[override]
        raise AssertionError("description access should not occur")

    @description.setter
    def description(self, value: str | None) -> None:  # type: ignore[override]
        if value not in (None, ""):
            raise AssertionError("description should not be mutated")


class TestMultiModalTextPayloadBuilder:
    """Assertions covering description-free payload construction."""

    def setup_method(self) -> None:
        self.builder = MultiModalTextPayloadBuilder()

    def test_description_field_is_never_read(self) -> None:
        adapter = _DescriptionGuardAdapter()

        payload = self.builder.build_payload(adapter)

        assert payload["semantic"]
        assert payload["artistic"]
        assert isinstance(payload["technical"], str)

    @pytest.mark.parametrize("text", ["lavish neon skyline", "moody noir scene"])
    def test_description_has_no_effect_on_payload(self, text: str) -> None:
        base_adapter = _Adapter(description=None)
        described_adapter = _Adapter(description=text)

        payload_without_description = self.builder.build_payload(base_adapter)
        payload_with_description = self.builder.build_payload(described_adapter)

        assert payload_with_description == payload_without_description
        # Defensive assertion to ensure description text is not echoed anywhere.
        assert text not in " ".join(payload_with_description.values())
