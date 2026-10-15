"""Adapter file identity: importer mapping, upsert matching, duplicate refusal."""

import json

import pytest

from backend.schemas.adapters import AdapterCreate
from backend.services.adapters import AdapterIdentityConflict, AdapterService

SHA = "66490cdca0a6168a5c7426eb6f079c95995c2b906342640b8c4eb781f53eadd6"


def _write_sidecar(tmp_path, data, stem="char"):
    jp = tmp_path / f"{stem}.json"
    (tmp_path / f"{stem}.safetensors").write_text("binary", encoding="utf-8")
    jp.write_text(json.dumps(data), encoding="utf-8")
    return jp


def test_parse_maps_archetype_ids_and_preview(tmp_path):
    """Sidecar archetype, CivitAI ids and the first still image become fields."""
    from scripts.importer import parse_civitai_json

    jp = _write_sidecar(
        tmp_path,
        {
            "name": "Killua Zoldyck",
            "archetype": "Cool-Sharp-Rival",
            "archetype_axes": {"hair": "white spiky"},
            "civitai": {"modelId": 375513, "versionId": 1153592},
            "modelVersions": [
                {
                    "id": 999,
                    "name": "v1",
                    "trainedWords": ["killua_zoldyck"],
                    "images": [
                        {"url": "https://img/clip.mp4", "nsfwLevel": 1},
                        {"url": "https://img/anim.webp", "type": "video"},
                        {"url": "https://img/first.jpeg", "nsfwLevel": 4},
                        {"url": "https://img/second.jpeg", "nsfwLevel": 1},
                    ],
                }
            ],
        },
    )

    parsed = parse_civitai_json(str(jp))

    assert parsed.extra["archetype"] == "Cool-Sharp-Rival"
    assert parsed.extra["civitai_model_id"] == 375513
    # explicit sidecar id wins over modelVersions[0].id
    assert parsed.extra["civitai_version_id"] == 1153592
    # videos are skipped; rating is left to whoever wrote the sidecar
    assert parsed.extra["preview_image_url"] == "https://img/first.jpeg"
    unmapped = parsed.extra["unmapped"]
    assert "archetype" not in unmapped and "civitai" not in unmapped
    assert unmapped["archetype_axes"] == {"hair": "white spiky"}


def test_parse_plain_civitai_model_json(tmp_path):
    """Standard CivitAI model JSON: top-level id is the model, version from list."""
    from scripts.importer import parse_civitai_json

    jp = _write_sidecar(
        tmp_path,
        {
            "id": 42,
            "name": "plain",
            "modelVersions": [
                {"id": 7, "images": [{"url": "https://img/a.png", "nsfw": "None"}]}
            ],
        },
    )

    parsed = parse_civitai_json(str(jp))

    assert parsed.extra["civitai_model_id"] == 42
    assert parsed.extra["civitai_version_id"] == 7
    assert parsed.extra["preview_image_url"] == "https://img/a.png"
    assert parsed.extra["archetype"] is None


def test_parse_without_still_image_leaves_preview_empty(tmp_path):
    """Only videos means no preview."""
    from scripts.importer import parse_civitai_json

    jp = _write_sidecar(
        tmp_path,
        {
            "name": "video-only",
            "modelVersions": [
                {"id": 1, "images": [{"url": "https://img/v.mp4", "type": "video"}]}
            ],
        },
    )

    assert parse_civitai_json(str(jp)).extra["preview_image_url"] is None


def test_explicit_preview_url_wins(tmp_path):
    """A sidecar's own preview_image_url is used as-is."""
    from scripts.importer import parse_civitai_json

    jp = _write_sidecar(
        tmp_path,
        {
            "name": "chosen",
            "preview_image_url": "https://img/chosen.jpeg",
            "modelVersions": [{"id": 1, "images": [{"url": "https://img/o.jpeg"}]}],
        },
    )

    assert parse_civitai_json(str(jp)).extra["preview_image_url"] == (
        "https://img/chosen.jpeg"
    )


def test_upsert_matches_same_file_under_new_name(db_session, mock_storage):
    """Same hash (any case) updates the stored adapter instead of adding one."""
    mock_storage.exists.return_value = True
    svc = AdapterService(db_session)

    first = svc.upsert_adapter(
        AdapterCreate(
            name="Bakugo", file_path="/tmp/b.safetensors", primary_file_sha256=SHA
        )
    )
    assert first.primary_file_sha256 == SHA.upper()

    again = svc.upsert_adapter(
        AdapterCreate(
            name="Katsuki Bakugo",
            version="v2",
            file_path="/tmp/b.safetensors",
            primary_file_sha256=SHA.lower(),
            archetype="Spiky-Hothead",
        )
    )

    assert again.id == first.id
    assert again.archetype == "Spiky-Hothead"
    assert svc.count_total() == 1


def test_upsert_matches_civitai_version_id(db_session, mock_storage):
    """A CivitAI version id identifies the adapter even without a hash."""
    mock_storage.exists.return_value = True
    svc = AdapterService(db_session)

    first = svc.upsert_adapter(
        AdapterCreate(name="a", file_path="/tmp/a", civitai_version_id=1153592)
    )
    second = svc.upsert_adapter(
        AdapterCreate(
            name="renamed",
            file_path="/tmp/a",
            civitai_version_id=1153592,
            preview_image_url="https://img/p.jpeg",
        )
    )

    assert second.id == first.id
    assert second.preview_image_url == "https://img/p.jpeg"
    assert svc.count_total() == 1


def test_api_refuses_duplicate_file(client, mock_storage):
    """Creating the same file twice is refused, by hash and by version id."""
    mock_storage.exists.return_value = True
    base = {"name": "one", "file_path": "/fake/1", "weight": 1.0}

    created = client.post(
        "/api/v1/adapters",
        json={**base, "primary_file_sha256": SHA, "civitai_version_id": 5},
    )
    assert created.status_code == 201
    body = created.json()["adapter"]
    assert body["civitai_version_id"] == 5
    assert body["primary_file_sha256"] == SHA.upper()

    by_hash = client.post(
        "/api/v1/adapters",
        json={**base, "name": "two", "primary_file_sha256": SHA.lower()},
    )
    assert by_hash.status_code == 400
    assert "file hash" in json.dumps(by_hash.json())

    by_version = client.post(
        "/api/v1/adapters", json={**base, "name": "three", "civitai_version_id": 5}
    )
    assert by_version.status_code == 400
    assert "CivitAI version" in json.dumps(by_version.json())


def test_upsert_refuses_same_label_for_a_different_file(db_session, mock_storage):
    """Two files sharing a (name, version) label must not merge into one row."""
    mock_storage.exists.return_value = True
    svc = AdapterService(db_session)
    first = svc.upsert_adapter(
        AdapterCreate(
            name="Gojo Satoru",
            version="v1.0",
            file_path="/tmp/gojo_a.safetensors",
            primary_file_sha256="AA",
            civitai_version_id=1,
        )
    )

    with pytest.raises(AdapterIdentityConflict, match="different file"):
        svc.upsert_adapter(
            AdapterCreate(
                name="Gojo Satoru",
                version="v1.0",
                file_path="/tmp/gojo_b.safetensors",
                primary_file_sha256="BB",
                civitai_version_id=2,
            )
        )

    db_session.refresh(first)
    assert first.primary_file_sha256 == "AA"
    assert first.civitai_version_id == 1
    assert first.file_path == "/tmp/gojo_a.safetensors"
    assert svc.count_total() == 1


def test_upsert_fills_identity_into_label_match_without_one(db_session, mock_storage):
    """A (name, version) match with no stored identity is still updated."""
    mock_storage.exists.return_value = True
    svc = AdapterService(db_session)
    first = svc.upsert_adapter(
        AdapterCreate(name="Gon", version="v1", file_path="/tmp/gon.safetensors")
    )

    again = svc.upsert_adapter(
        AdapterCreate(
            name="Gon",
            version="v1",
            file_path="/tmp/gon.safetensors",
            primary_file_sha256=SHA,
            civitai_version_id=7,
        )
    )

    assert again.id == first.id
    assert again.primary_file_sha256 == SHA.upper()
    assert again.civitai_version_id == 7


def test_upsert_refuses_identity_split_across_two_adapters(db_session, mock_storage):
    """Version id of one adapter plus the hash of another is a conflict.

    Updating either row would copy the other's identity onto it and violate
    the unique indexes.
    """
    mock_storage.exists.return_value = True
    svc = AdapterService(db_session)
    a = svc.upsert_adapter(
        AdapterCreate(
            name="A", file_path="/tmp/a", primary_file_sha256="AA", civitai_version_id=1
        )
    )
    svc.upsert_adapter(
        AdapterCreate(
            name="B", file_path="/tmp/b", primary_file_sha256="BB", civitai_version_id=2
        )
    )

    with pytest.raises(AdapterIdentityConflict, match="two different adapters"):
        svc.upsert_adapter(
            AdapterCreate(
                name="A",
                file_path="/tmp/a",
                primary_file_sha256="BB",
                civitai_version_id=1,
            )
        )

    db_session.refresh(a)
    assert a.primary_file_sha256 == "AA"
    assert svc.count_total() == 2


def test_api_reports_identity_conflicts_as_400(client, mock_storage):
    """Conflicting identity is a client error, not an IntegrityError 500."""
    mock_storage.exists.return_value = True
    base = {"file_path": "/fake/1", "weight": 1.0}
    for name, sha, version_id in (("A", "AA", 1), ("B", "BB", 2)):
        created = client.post(
            "/api/v1/adapters",
            json={
                **base,
                "name": name,
                "version": "v1",
                "primary_file_sha256": sha,
                "civitai_version_id": version_id,
            },
        )
        assert created.status_code == 201

    split = client.post(
        "/api/v1/adapters",
        json={
            **base,
            "name": "C",
            "primary_file_sha256": "BB",
            "civitai_version_id": 1,
        },
    )
    assert split.status_code == 400
    assert "two different adapters" in json.dumps(split.json())

    same_label = client.post(
        "/api/v1/adapters",
        json={
            **base,
            "name": "A",
            "version": "v1",
            "primary_file_sha256": "CC",
            "civitai_version_id": 3,
        },
    )
    assert same_label.status_code == 400
    assert "different file" in json.dumps(same_label.json())
