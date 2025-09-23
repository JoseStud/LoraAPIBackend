"""Shared fixtures for generation job tests."""

from __future__ import annotations

from typing import Callable, Dict

import pytest


@pytest.fixture
def generation_params_factory() -> Callable[[str], Dict[str, Dict[str, object]]]:
    """Provide a factory that builds generation parameter payloads."""

    def _factory(prompt: str) -> Dict[str, Dict[str, object]]:
        return {
            "generation_params": {
                "prompt": prompt,
                "negative_prompt": "nope",
                "width": 640,
                "height": 480,
                "steps": 25,
                "cfg_scale": 7.5,
                "seed": 1234,
            },
        }

    return _factory
