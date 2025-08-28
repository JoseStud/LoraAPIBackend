
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
- API contract hardening: Endpoints use `response_model` to provide stable API contracts and error responses follow the RFC7807 standard.
- Observability: Structured logging and metrics (Prometheus) are not yet implemented.
- File storage: A storage abstraction layer has been implemented in `storage.py`, with an initial implementation for the local filesystem.

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
