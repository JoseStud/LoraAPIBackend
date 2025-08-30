"""Tests for importer parsing logic."""

import json


def test_parse_civitai_json_with_model(tmp_path):
    jp = tmp_path / "char.json"
    model = tmp_path / "char.safetensors"
    data = {
        "name": "char-lora",
        "version": "1.0",
        "tags": ["a", "b"],
        "weight": 0.5,
    }
    jp.write_text(json.dumps(data), encoding="utf-8")
    model.write_text("binary", encoding="utf-8")

    from scripts.importer import parse_civitai_json

    parsed = parse_civitai_json(str(jp))
    assert parsed.name == "char-lora"
    assert parsed.version == "1.0"
    assert parsed.tags == ["a", "b"]
    assert parsed.weight == 0.5
    assert parsed.file_path.endswith("char.safetensors")


def test_parse_civitai_json_without_model(tmp_path):
    jp = tmp_path / "other.json"
    data = {"name": "other-lora"}
    jp.write_text(json.dumps(data), encoding="utf-8")

    from scripts.importer import parse_civitai_json

    parsed = parse_civitai_json(str(jp))
    assert parsed.name == "other-lora"
    # fallback candidate uses .safetensors even if file doesn't exist
    assert parsed.file_path.endswith("other.safetensors")
