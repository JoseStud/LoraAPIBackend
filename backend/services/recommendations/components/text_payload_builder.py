"""Utilities to build text payloads for multi-modal embedding inputs."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List


class MultiModalTextPayloadBuilder:
    """Create semantic, artistic, and technical text payloads for LoRAs."""

    _ART_KEYWORDS: tuple[str, ...] = (
        "anime",
        "realistic",
        "cartoon",
        "abstract",
        "photographic",
        "digital art",
        "painting",
        "sketch",
        "3d render",
        "pixel art",
        "watercolor",
        "oil painting",
        "concept art",
        "illustration",
        "manga",
        "comic",
        "fantasy",
        "sci-fi",
        "portrait",
        "landscape",
    )

    _ART_TAG_KEYWORDS: tuple[str, ...] = (
        "style",
        "art",
        "anime",
        "realistic",
        "character",
        "portrait",
        "landscape",
        "fantasy",
        "sci-fi",
        "concept",
        "illustration",
        "digital",
        "painting",
        "drawing",
        "sketch",
        "3d",
        "render",
    )

    def build_payload(self, lora: Any) -> Dict[str, str]:
        """Create multi-modal text payloads from a LoRA object."""

        return {
            "semantic": self._build_semantic_payload(lora),
            "artistic": self._build_artistic_payload(lora),
            "technical": self._build_technical_payload(lora),
        }

    # ------------------------------------------------------------------
    # Semantic helpers
    # ------------------------------------------------------------------
    def _build_semantic_payload(self, lora: Any) -> str:
        components: List[str] = []
        description = getattr(lora, "description", None)
        if description:
            components.append(f"Description: {description}")

        trained_words: Iterable[str] | None = getattr(lora, "trained_words", None)
        if trained_words:
            components.append(f"Trained on: {', '.join(trained_words)}")

        triggers: Iterable[str] | None = getattr(lora, "triggers", None)
        if triggers:
            components.append(f"Triggers: {', '.join(triggers)}")

        activation_text = getattr(lora, "activation_text", None)
        if activation_text:
            components.append(f"Activation: {activation_text}")

        return " | ".join(components)

    # ------------------------------------------------------------------
    # Artistic helpers
    # ------------------------------------------------------------------
    def _build_artistic_payload(self, lora: Any) -> str:
        components: List[str] = []

        description = getattr(lora, "description", None)
        if description:
            artistic_terms = self._extract_artistic_terms(description)
            if artistic_terms:
                components.append(artistic_terms)

        tags: Iterable[str] | None = getattr(lora, "tags", None)
        if tags:
            artistic_tags = [tag for tag in tags if self._is_artistic_tag(tag)]
            if artistic_tags:
                components.append(f"Art style: {', '.join(artistic_tags)}")

        archetype = getattr(lora, "archetype", None)
        if archetype:
            components.append(f"Character type: {archetype}")

        return " | ".join(components)

    def _extract_artistic_terms(self, description: str) -> str:
        """Extract artistic and style-related terms from description."""
        if not description:
            return ""

        desc_lower = description.lower()
        found_terms = [
            keyword for keyword in self._ART_KEYWORDS if keyword in desc_lower
        ]
        return ", ".join(found_terms[:5])

    def _is_artistic_tag(self, tag: str) -> bool:
        """Check if a tag is art/style related."""
        tag_lower = tag.lower()
        return any(keyword in tag_lower for keyword in self._ART_TAG_KEYWORDS)

    # ------------------------------------------------------------------
    # Technical helpers
    # ------------------------------------------------------------------
    def _build_technical_payload(self, lora: Any) -> str:
        components: List[str] = []

        sd_version = getattr(lora, "sd_version", None)
        if sd_version:
            components.append(f"SD Version: {sd_version}")

        if getattr(lora, "supports_generation", None):
            components.append("Supports generation")

        nsfw_level = getattr(lora, "nsfw_level", None)
        if nsfw_level is not None:
            safety_level = "Safe" if nsfw_level == 0 else f"NSFW Level {nsfw_level}"
            components.append(f"Safety: {safety_level}")

        size_kb = getattr(lora, "primary_file_size_kb", None)
        if size_kb:
            components.append(f"Model size: {self._categorize_file_size(size_kb)}")

        return " | ".join(components)

    def _categorize_file_size(self, size_kb: int) -> str:
        """Categorize file size for technical understanding."""
        size_mb = size_kb / 1024

        if size_mb < 50:
            return "Small"
        if size_mb < 200:
            return "Medium"
        if size_mb < 500:
            return "Large"
        return "Very Large"


__all__ = ["MultiModalTextPayloadBuilder"]
