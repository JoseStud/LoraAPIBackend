"""Test the comprehensive importer with full Civitai-style JSON."""

import json
import tempfile
from pathlib import Path


def test_comprehensive_civitai_parsing():
    """Test parsing a comprehensive Civitai JSON with all metadata fields."""
    civitai_data = {
        "id": 1757741,
        "name": "Test Character LoRA",
        "description": "A test character LoRA for testing purposes",
        "type": "LORA",
        "nsfw": False,
        "nsfwLevel": 1,
        "supportsGeneration": True,
        "creator": {
            "username": "testuser",
            "image": "https://example.com/avatar.jpg",
        },
        "tags": ["character", "anime", "test"],
        "modelVersions": [
            {
                "id": 1989305,
                "name": "V1.2",
                "publishedAt": "2025-07-10T00:11:53.379Z",
                "trainedWords": ["test_char", "blue_hair", "sword"],
                "files": [
                    {
                        "id": 1887118,
                        "sizeKB": 223102.35546875,
                        "name": "test_character.safetensors",
                        "type": "Model",
                        "primary": True,
                        "hashes": {
                            "SHA256": "ABC123DEF456789",
                            "AutoV2": "DEF456",
                        },
                        "downloadUrl": "https://example.com/download/model",
                    },
                ],
            },
        ],
        "stats": {
            "downloadCount": 500,
            "favoriteCount": 25,
            "thumbsUpCount": 100,
        },
        "activation text": "test_char, blue_hair",
        "sd version": "SDXL",
    }

    with tempfile.TemporaryDirectory() as tmpdir:
        json_path = Path(tmpdir) / "test.json"
        model_path = Path(tmpdir) / "test_character.safetensors"

        # Write JSON and model file
        json_path.write_text(json.dumps(civitai_data))
        model_path.write_text("fake model data")

        from scripts.importer import parse_civitai_json, register_adapter_from_metadata

        # Parse the comprehensive JSON
        parsed = parse_civitai_json(str(json_path))

        # Verify all fields are extracted
        assert parsed.name == "Test Character LoRA"
        assert parsed.version == "V1.2"
        assert parsed.tags == ["character", "anime", "test"]

        extra = parsed.extra
        assert extra["author_username"] == "testuser"
        assert extra["description"] == "A test character LoRA for testing purposes"
        assert extra["published_at"] == "2025-07-10T00:11:53.379Z"
        assert extra["trained_words"] == ["test_char", "blue_hair", "sword"]
        assert extra["primary_file_name"] == "test_character.safetensors"
        assert extra["primary_file_sha256"] == "ABC123DEF456789"
        assert extra["supports_generation"] is True
        assert extra["nsfw_level"] == 1
        assert extra["sd_version"] == "SDXL"
        assert extra["activation_text"] == "test_char, blue_hair"
        assert extra["stats"]["downloadCount"] == 500

        # Test dry-run output
        result = register_adapter_from_metadata(
            parsed,
            json_path=str(json_path),
            dry_run=True,
        )
        assert result["status"] == "would_register"

        payload = result["payload"]
        assert payload["name"] == "Test Character LoRA"
        assert payload["version"] == "V1.2"
        assert payload["author_username"] == "testuser"
        assert payload["primary_file_name"] == "test_character.safetensors"
        assert payload["trained_words"] == ["test_char", "blue_hair", "sword"]
        assert payload["supports_generation"] is True
        assert payload["nsfw_level"] == 1
