# Library import and archives

[← Wiki home](README.md)

How adapters get into the database, and how the collection is exported,
imported and backed up.

## The importer

[`scripts/importer.py`](../../scripts/importer.py) scans a directory of LoRA
files with Civitai-style JSON sidecars and registers an adapter per JSON file.
The field-by-field mapping is in [JSON_IMPORT_FLOW.md](../../JSON_IMPORT_FLOW.md).

### How a scan works

1. `discover_metadata` walks `IMPORT_PATH` recursively and yields every
   `*.json` file, skipping paths that match `IMPORT_IGNORE_PATTERNS` (globs
   relative to the import root; directories are pruned early).
2. `needs_resync` skips a JSON file whose modification time is not newer than
   the `json_file_mtime` stored on its adapter, unless `--force-resync`.
3. `parse_civitai_json` turns the file into `ParsedMetadata`: name, version,
   trained words, tags, file info (name, size, SHA-256, download URL), Civitai
   ids, the first still preview image, stats.
4. `register_adapter_from_metadata` calls `services.adapters.upsert_adapter`,
   which is idempotent and matches an existing adapter by **file identity**:
   - the Civitai version id, then the primary file SHA-256;
   - if both match different adapters, it raises `AdapterIdentityConflict`;
   - otherwise it falls back to (`name`, `version`), and refuses if that pair
     belongs to a different file.
5. `discover_orphan_safetensors` reports `.safetensors` files with no matching
   JSON, so you know what was not imported.

The run returns a summary: processed, skipped, errors and orphans.

### Ways to run it

| How | Command / setting |
| --- | --- |
| On API startup, once | `IMPORT_ON_STARTUP=true` (plus `IMPORT_ON_STARTUP_FORCE_RESYNC`, `IMPORT_ON_STARTUP_DRY_RUN`). Runs in a thread; failures only log. |
| Polling loop | `python scripts/importer.py --path /app/loras --poll 10` |
| Dry run | add `--dry-run`: logs actions, writes nothing |
| Re-import everything | add `--force-resync` |
| Extra ignores | `--ignore 'backups/**'` (repeatable, added to `IMPORT_IGNORE_PATTERNS`) |

In Docker the library is `LORA_HOST_DIR` mounted at `/app/loras`. Point it at
SDNext's `models/Lora` so that `<lora:NAME:w>` tokens resolve in SDNext against
the same files the database describes.

`SYSTEM_IMPORTER_STALE_HOURS` makes `/system/status` warn when the last import
is older than that.

## Creating adapters through the API

`POST /v1/adapters` creates one adapter after validating the file path and
the name/version uniqueness. Same identity rules as the importer. Bulk
activate, deactivate and delete go through `POST /v1/adapters/bulk`.

## Export, import and backups

Endpoints in [`backend/api/v1/import_export.py`](../../backend/api/v1/import_export.py),
services in [`backend/services/archive/`](../../backend/services/archive):

| Endpoint | What it does | Service |
| --- | --- | --- |
| `POST /v1/export/estimate` | Size and file count for an export selection | `ArchiveExportPlanner` |
| `POST /v1/export` | Builds a ZIP (`manifest.json`, adapter metadata, optionally files) in a spooled temp file and streams it | `ArchiveService` (`facade.py`) |
| `POST /v1/import` | Ingests an uploaded archive | `ArchiveImportExecutor` |
| `GET /v1/backups/history` | Lists backups | `BackupService` |
| `POST /v1/backup/create` | Creates a backup | `BackupService` |
| `DELETE /v1/backups/{id}` | Deletes a backup | `BackupService` |

Backups live in `<IMPORT_PATH>/backups/`, indexed by `backups/history.json`.

Generation results have their own export: `POST /v1/generation/results/export`
streams a ZIP of selected results (`backend/services/delivery_results/`).

## Tests

`tests/test_importer.py`, `tests/test_comprehensive_importer.py`,
`tests/test_importer_integration.py`, `tests/test_upsert.py`,
`tests/test_adapter_identity.py`, `tests/api/test_import_export.py` and
`tests/test_backup_endpoints.py`. Sample files live in `loras/test/`.

Next: [Configuration](Configuration.md).
