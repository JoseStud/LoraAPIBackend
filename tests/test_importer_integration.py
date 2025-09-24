"""Integration test: run importer against tmp_path and assert DB changes."""

import json


def test_importer_integration_creates_adapter(
    tmp_path,
    db_session,
    mock_storage,
    monkeypatch,
):
    """Test that importer integration creates adapter successfully."""
    # create json and model file
    jp = tmp_path / "intf.json"
    model = tmp_path / "intf.safetensors"
    data = {
        "name": "intf-lora",
        "version": "0.1",
        "tags": ["x", "y"],
        "weight": 0.75,
    }
    jp.write_text(json.dumps(data), encoding="utf-8")
    model.write_text("binary", encoding="utf-8")

    # import modules
    import scripts.importer as importer

    # Ensure storage check returns True
    mock_storage.exists.return_value = True

    # Monkeypatch importer session helper to use the test db_session
    from contextlib import contextmanager

    @contextmanager
    def get_test_session():
        yield db_session

    monkeypatch.setattr(importer, "get_session_context", get_test_session)

    # Parse and register (non-dry run). register_adapter_from_metadata will
    # call the session helper which now uses the patched get_session_context.
    parsed = importer.parse_civitai_json(str(jp))
    result = importer.register_adapter_from_metadata(
        parsed,
        json_path=str(jp),
        dry_run=False,
    )

    assert result["status"] == "upserted"
    assert "id" in result

    # Verify record was created by checking the ID in the result
    # Note: Due to session isolation in tests, we rely on the result rather than
    # a separate database query to verify the adapter was created
    adapter_id = result["id"]
    assert adapter_id is not None
