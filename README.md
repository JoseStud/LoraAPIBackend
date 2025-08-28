
LoRA Manager Backend (MVP)

This folder contains a small FastAPI-based backend implementing the LoRA Manager API contract (see `contract.md`).

What this repository contains
- `main.py` - app entrypoint that wires routers and initializes the DB.
- `models.py` - SQLModel models for `Adapter` and `DeliveryJob` (SQLite by default).
- `db.py` - small helper to create/get the SQLite engine and sessions.
- `schemas.py` - request/shape Pydantic models used by routers.
- `services.py` - business logic helpers (validation, composition, delivery helpers, job creation).
- `routers/` - small routers split by concern: `adapters`, `compose`, `deliveries`.
- `tests/` - basic pytest suite covering core flows.

Quickstart (development)

1. Create a Python venv and install dependencies:

```bash
cd /path/to/backend-api
python -m venv .venv
source .venv/bin/activate
pip install -r dev-requirements.txt
```

2. Run the server locally:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

3. Run tests:

```bash
PYTHONPATH=$(pwd) pytest -q
```

Runtime notes
- Persistence: default SQLite DB is created at `db.sqlite` next to the app on first run. This can be configured with the `DATABASE_URL` environment variable.
- Tags: for SQLite the `tags` field is stored as a JSON-encoded string. Routers decode into arrays for API responses.
- Timezones: datetimes use timezone-aware UTC values (created_at/updated_at).
- Pydantic/SQLModel: `.model_dump()` is used when serializing SQLModel objects (v2-compatible pattern).

API surface (high level)
- POST /adapters — register adapter metadata (validates local `file_path` exists).
- GET /adapters — paginated list with optional `active` filter.
- GET /adapters/{id} — fetch adapter.
- PATCH /adapters/{id} — partial update.
- DELETE /adapters/{id} — delete metadata entry.
- POST /adapters/{id}/activate — set active (optionally set ordinal).
- POST /adapters/{id}/deactivate — set inactive.
- POST /compose — compose prompt from active adapters and optionally enqueue a delivery.
- POST /deliveries — enqueue a delivery job.
- GET /deliveries/{id} — query delivery job status/result.
- GET /health — basic health check.

Development notes and next steps
- Worker queue: A background worker using Redis and RQ has been scaffolded to process delivery jobs asynchronously. See `tasks.py` and `run_worker.py`.
- Migrations: Alembic is configured for database schema migrations. See `alembic.ini` and the `alembic/` directory.
- Serialization: Endpoints use `response_model` to provide stable API contracts.
- Observability: Structured logging and metrics (Prometheus) are not yet implemented.
- File storage: A storage abstraction layer has been implemented in `storage.py`, with an initial implementation for the local filesystem.

Local files with remote metadata sync (CivitAI)
----------------------------------------------

Goal: Keep LoRA model files on your local filesystem while syncing metadata (name, tags, checksum, preview URL, s3 path, etc.) to a remote metadata store so external validators or services (for example, CivitAI) can access metadata without direct filesystem access.

Modes:
1. Local-only runtime: set `STORAGE_TYPE=local`. Adapter `file_path` values are absolute local paths and the API validates files on the host filesystem. Use when API and workers run on the same machine.
2. Metadata-sync: keep `STORAGE_TYPE=local` for files, but enable metadata sync to a remote store (S3/MinIO). Metadata JSON files are uploaded to a configured metadata bucket/prefix. External validators can read this metadata to perform validation or request file access out-of-band.
3. Full remote mode: upload files to S3/MinIO and register `s3://bucket/key` URIs in adapters (`STORAGE_TYPE=s3`). Use for multi-host/cloud deployments.

Recommended optional env vars (new):
- `METADATA_SYNC=true`              # enable metadata upload on adapter create/update
- `METADATA_STORAGE=s3`            # storage backend for metadata (s3 supported)
- `METADATA_BUCKET=lora-metadata`
- `METADATA_PREFIX=metadata`       # optional prefix under the bucket
- `STORAGE_TYPE=local`             # keep files local
- `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`  # when METADATA_STORAGE=s3
- `CIVITAI_API_KEY` (optional)     # if you want the server/script to call CivitAI validation
- `CIVITAI_VALIDATE_URL` (optional)

Workflow (example):
1. Place LoRA files under your local LoRA directory (e.g. `/data/loras`).
2. POST to `POST /adapters` with `file_path` set to the absolute local path. The API will:
   - validate the file exists locally,
   - create the `Adapter` DB record,
   - if `METADATA_SYNC=true`, upload a metadata JSON to the configured metadata storage (e.g. `s3://METADATA_BUCKET/METADATA_PREFIX/{adapter_id}.json`),
   - optionally call a CivitAI validation endpoint with the metadata (if `CIVITAI_API_KEY`/`CIVITAI_VALIDATE_URL` are provided).
3. External consumers read metadata JSON from the metadata store to perform validation or fetch files if they have access.

Example metadata JSON shape:

```json
{
  "id": "<adapter-id>",
  "name": "<adapter-name>",
  "file_path": "/abs/path/to/file.safetensors",
  "sha256": "<hex>",
  "size_bytes": 12345,
  "tags": ["style:anime","resolution:512"],
  "created_at": "2025-08-28T12:00:00Z",
  "preview_url": "https://cdn.example/preview/<id>.png"
}
```

Minimal helper/script outline (sync metadata and optionally call CivitAI):

```python
# scripts/sync_metadata.py (outline)
import json, os, hashlib, time
import boto3, requests

def compute_sha256(path):
	h = hashlib.sha256()
	with open(path, 'rb') as f:
		for chunk in iter(lambda: f.read(8192), b''):
			h.update(chunk)
	return h.hexdigest()

def build_metadata(adapter):
	return {
		'id': adapter['id'],
		'name': adapter.get('name'),
		'file_path': adapter['file_path'],
		'sha256': compute_sha256(adapter['file_path']),
		'size_bytes': os.path.getsize(adapter['file_path']),
		'tags': adapter.get('tags', []),
		'created_at': adapter.get('created_at', time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())),
	}

def upload_metadata_s3(bucket, key, metadata_json, endpoint_url=None, aws_key=None, aws_secret=None):
	s3 = boto3.client('s3', endpoint_url=endpoint_url, aws_access_key_id=aws_key, aws_secret_access_key=aws_secret)
	s3.put_object(Bucket=bucket, Key=key, Body=json.dumps(metadata_json).encode('utf-8'), ContentType='application/json')

def call_civitai_validate(url, api_key, metadata_json):
	headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
	return requests.post(url, headers=headers, json=metadata_json, timeout=30)

# Use these helpers from a small integration script or call them from the API on adapter creation
```

Server-side notes:
- Implement the `METADATA_SYNC` flow in adapter create/update handlers: after DB commit, construct metadata JSON, upload via the configured storage adapter (S3 supported), and optionally call the CivitAI endpoint.
- Make metadata upload idempotent: use adapter ID in object key and overwrite on updates.
- Security: avoid storing secrets in metadata; use signed URLs for previews if needed.


If you want, see `DEVELOPMENT.md` for detailed implementation notes, architecture and recommended next steps.

Files

- `README.md` (this file): high-level purpose and how to use the other files.
- `contract.md`: API contract with endpoint descriptions and sample payloads.
- `openapi_example.yaml`: minimal OpenAPI fragment showing `/adapters` and `/compose` paths.

Next steps

- Review `DEVELOPMENT.md` for a full list of implemented features and recommended next steps.
- Implement additional storage backends (e.g., S3/MinIO).
- Add authentication and authorization.
- Integrate structured logging and metrics.

Runtime notes
- Persistence: default SQLite DB is created at `db.sqlite` next to the app on first run.
- Tags: for SQLite the `tags` field is stored as a JSON-encoded string. Routers decode into arrays for API responses.
- Timezones: datetimes use timezone-aware UTC values (created_at/updated_at).
- Pydantic/SQLModel: `.model_dump()` is used when serializing SQLModel objects (v2-compatible pattern).

API surface (high level)
- POST /adapters — register adapter metadata (validates local `file_path` exists).
- GET /adapters — paginated list with optional `active` filter.
- GET /adapters/{id} — fetch adapter.
- PATCH /adapters/{id} — partial update.
- DELETE /adapters/{id} — delete metadata entry.
- POST /adapters/{id}/activate — set active (optionally set ordinal).
- POST /adapters/{id}/deactivate — set inactive.
- POST /compose — compose prompt from active adapters and optionally enqueue a delivery.
- POST /deliveries — enqueue a delivery job.
- GET /deliveries/{id} — query delivery job status/result.
- GET /health — basic health check.

Development notes and next steps
- Worker queue: deliveries are enqueued into the `DeliveryJob` table. For production, implement a worker (Redis + RQ/Celery) to process jobs and update `status`/`result`.
- Migrations: Alembic is available in `requirements.txt` — add an `alembic/` config if you plan to migrate to Postgres/SQLite with migrations.
- Serialization: consider explicit `response_model=` declarations on routers to lock the API contract.
- Observability: add structured logging and metrics (Prometheus) for delivery latency and failure counts.
- File storage: currently only local FS verification is implemented. Add storage adapter abstraction for S3/MinIO.

If you want, see `DEVELOPMENT.md` for detailed implementation notes, architecture and recommended next steps.

Files

- `README.md` (this file): high-level purpose and how to use the other files.
- `contract.md`: API contract with endpoint descriptions and sample payloads.
- `openapi_example.yaml`: minimal OpenAPI fragment showing `/adapters` and `/compose` paths.

Next steps

- Use the OpenAPI example to scaffold a FastAPI server (or run `openapi-generator` if desired).
- Implement a lightweight SQLite-backed persistence using SQLModel.
- Add unit tests for `prompt_composer` logic.
