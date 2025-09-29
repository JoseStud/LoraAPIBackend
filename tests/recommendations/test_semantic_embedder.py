"""Tests for the semantic embedder implementation."""

from __future__ import annotations

import numpy as np

from backend.services.recommendations.components.embedder import (
    LoRASemanticEmbedder,
)


class TestLoRASemanticEmbedder:
    """Unit tests covering prompt embedding generation."""

    def setup_method(self) -> None:
        self.embedder = LoRASemanticEmbedder(device="cpu", force_fallback=True)

    def test_compute_prompt_embeddings_returns_modalities(self) -> None:
        prompt = "dreamy watercolor landscape"

        result = self.embedder.compute_prompt_embeddings(prompt, device="cpu")

        assert set(result.keys()) == {"semantic", "artistic", "technical"}
        assert all(isinstance(vector, np.ndarray) for vector in result.values())
        assert all(vector.dtype == np.float32 for vector in result.values())
        assert result["semantic"].shape == (LoRASemanticEmbedder.SEMANTIC_DIM,)
        assert result["artistic"].shape == (LoRASemanticEmbedder.ARTISTIC_DIM,)
        assert result["technical"].shape == (LoRASemanticEmbedder.TECHNICAL_DIM,)

    def test_compute_prompt_embeddings_for_empty_prompt_returns_zeros(self) -> None:
        result = self.embedder.compute_prompt_embeddings("   ", device="cpu")

        for key, expected_dim in {
            "semantic": LoRASemanticEmbedder.SEMANTIC_DIM,
            "artistic": LoRASemanticEmbedder.ARTISTIC_DIM,
            "technical": LoRASemanticEmbedder.TECHNICAL_DIM,
        }.items():
            embedding = result[key]
            assert embedding.shape == (expected_dim,)
            assert np.allclose(embedding, 0.0)
