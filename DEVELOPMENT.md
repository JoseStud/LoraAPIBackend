Developer notes — LoRA Manager Backend (MVP)

  Goal

  Provide context for maintainers and contributors on the implementation, modules,
  data flows, and recommended next steps for production-hardening.

  Architecture overview

  - FastAPI app. Routers are split into small modules under `routers/` for
    adapters, compose and deliveries.
  - SQLModel + SQLite as the default persistence for Metadata and DeliveryJob
    records (configurable via `DATABASE_URL`).
  - A `services.py` module centralizes business logic that can be reused by HTTP
    handlers and background workers.

  Key modules

  - `main.py` - app wiring and router inclusion. Uses a lifespan handler to call
    `init_db()` on startup so tests can set `DATABASE_URL` before app init.
  - `models.py` - SQLModel models:
    - Adapter: metadata about LoRA files and composition hints.
    - DeliveryJob: simple job table for asynchronous delivery processing.
  - `db.py` - SQLModel engine and session helpers. Default DB path: `db.sqlite`
    unless `DATABASE_URL` is supplied.
  - `schemas.py` - Pydantic request and response shapes used by routers.
  - `services.py` - core helpers:
    - `AdapterService` - handles adapter validation, persistence, and listing.
    - `DeliveryService` - creates and manages `DeliveryJob` records.
    - `ComposeService` - formats LoRA tokens for prompt composition.
    - `deliver_http`, `deliver_cli` - delivery helpers used by background
      tasks.

  - `storage.py` - provides helpers for interacting with the local filesystem
    storage where LoRA models are stored.

  - `config.py` - defines and manages application configuration using
    Pydantic's `BaseSettings`. It loads settings from environment variables
    and provides a single `settings` object for app-wide use.


  Linting & docstring policy
  -------------------------

  We use `ruff` as the primary linter with a small, conservative pydocstyle policy
  for docstrings. Key settings contributors should know about:

  - Line length: 88 characters (PEP 8 compatible).
  - Target Python: 3.10.
  - Rules selected: typical error/warning rules (E, F), import/order (I),
    bugbear (B), comprehensions (COM) and docstring checks (D).
  - We explicitly ignore two pydocstyle rules which conflict with the project's
    chosen docstring formatting: `D203` (blank line before class) and `D213`
    (multi-line summary second line). This allows using a single style
    (`no-blank-line-before-class` and `multi-line-summary-first-line`) consistently
    across the codebase.
  - Per-file ignore: `__init__.py` may re-export names and therefore allows
    `F401`.

  Rationale: `ruff` is fast and provides an auto-fix mode for many issues. We
  keep docstring checks enabled (D-series) to improve API documentation and
  maintainability, but we silence the two incompatible rules so contributors don't
  get conflicting fix suggestions. Please run `ruff --fix` locally before
  committing when possible.


  Design decisions to be aware of

  - Tags storage: The initial Alembic migration (`5f681a8fe826`) defines `tags`
    as a `sa.JSON()` column. Under SQLite this maps to a TEXT field with
    transparent JSON (no querying operators). Routers still (de)serialize
    Python list <-> JSON automatically via SQLAlchemy's JSON type. When moving
    to Postgres, replace / retain as JSONB and add a GIN index for tag
    membership queries; or consider a normalized tag table if you require
    relational constraints.
  - Timezones: Code intends to use timezone-aware UTC datetimes, but the
    initial migration currently creates naive `sa.DateTime()` columns (no
    `timezone=True`). A follow-up migration should alter these to
    `DateTime(timezone=True)` and application code should ensure `datetime.now(timezone.utc)` (or equivalent) is used. Documented here so the mismatch is explicit.
  - Serialization: routers use `model_dump()` to serialize SQLModel objects.
    Upgrading SQLModel and Pydantic versions may change serialization semantics;
    tests lock current expected behavior.
  - Background work: small, immediate tasks use `fastapi.BackgroundTasks` as a
    fallback. A more robust queue-backed worker flow (Redis + RQ) is the
    primary mechanism for asynchronous processing and is used by `tasks.py` for
    `DeliveryJob` processing when `REDIS_URL` is configured.


  Testing

  - `tests/test_main.py` contains basic API lifecycle tests for adapters and
    deliveries.
  - `tests/test_services.py` contains unit tests for the service layer classes
    (`AdapterService`, `DeliveryService`, `ComposeService`).
  - `tests/test_worker.py` contains tests for the RQ worker, using `fakeredis` to
    simulate the queue.
  - Tests use an isolated in-memory SQLite database per run, configured in
    `tests/conftest.py`. The `db.py` module respects the `DATABASE_URL` so tests
    can control the engine before the app is initialized.
  - The `mock_storage` fixture in `conftest.py` is used to mock filesystem
    interactions.

  Recommended next steps

  1) Worker queue
  - A Redis + RQ worker flow has been scaffolded and integrated. `tasks.py`
    contains the processing logic used by workers; `routers/deliveries.py` will
    enqueue when `REDIS_URL` is configured. A smoke test using `fakeredis` and
    `rq.SimpleWorker` exercises enqueue -> worker -> DB update.

    Gaps: add production-grade retry policies, backoff tuning and worker
    observability if you plan to run high-volume workloads.

  2) File storage
  - The `storage.py` module handles interactions with the local filesystem,
    where LoRA models are stored. It ensures that file paths are validated
    correctly. This makes it easy to manage models in a local directory.

  3) Migrations
  - Alembic scaffolding is in place and the initial migration has been applied
    (database is at head).

    ```bash
    PYTHONPATH=$(pwd) alembic upgrade head
    ```

  Future autogenerated migrations should still be reviewed carefully (JSON ->
  JSONB indexing, timezone flags, indexes) especially before switching to
  Postgres.
  Initial migration snapshot (key points):
  - `adapter` & `deliveryjob` tables created with string primary keys (AutoString, application-generated IDs expected).
  - `tags` column uses `sa.JSON()` (TEXT + JSON serialization in SQLite).
  - Timestamps (`created_at`, `updated_at`, etc.) are naive `DateTime()`.
  Follow-up actions:
  - Add `timezone=True` to datetime columns via a new migration (before Postgres deploy).
  - Add indexes for frequent lookups (e.g., `deliveryjob.status`, `adapter.active`, `adapter.created_at`).
  - Plan a GIN index on `tags` when moving to Postgres JSONB.

  4) API contract hardening
  - Most critical endpoints now declare explicit `response_model=` types and the
    project includes Pydantic "read" models for stable OpenAPI shapes. This
    prevents accidental exposure of internal fields and improves client
    generation.
  - RFC7807-style problem detail handlers have been added to centralize error
    responses.

  5) Observability
  - Structured logging and Prometheus metrics are not yet integrated. Adding a
    small `logging` config and `prometheus_client` instrumentation is a good next
    step.

  6) Security
  - No authentication is configured. Add optional auth (Bearer tokens) and role
    checks for write/delete operations before exposing the API publicly.

  7) Performance & scaling
  - The `docker-compose.yml` wires API and worker services (separation is
    supported). Add Postgres, indexes, and a CI matrix job to validate scaling and
    queries for production deployments.

  Small TODOs in repo

  - Update tests to use a temp DB per run: DONE ✅
    - Tests now create an isolated temporary SQLite DB per run by setting
      `DATABASE_URL` in the test harness. `db.py` respects the env var so the
      engine is configurable before app initialization. Local full test run: 4
      passed.

  - Provide a docker-compose that wires Redis + Postgres + worker + API for easy
    integration testing: DONE ✅
    - `docker-compose.yml` now wires Redis, Postgres, API, and an RQ worker,
      providing a full integration environment.

  If you want, I can implement any of the recommended next steps. Tell me which
  one and I'll scaffold it, add tests, and run fast validation (tests/lint) in
  this workspace.

  Progress vs recommended next steps

  Below is a short status map comparing the "Recommended next steps" from this
  document to what exists in the codebase (short pointers to files). This is
  intended to help maintainers pick the next work with minimal discovery.

  - Worker queue: DONE ✅
    - Status: A Redis + RQ-based worker flow is fully integrated with logging,
      retries, and exponential backoff.
    - Evidence: `tasks.py` contains `process_delivery` which updates `DeliveryJob`
      status/result and uses `rq.Queue`; `routers/deliveries.py` enqueues jobs;
      `docker-compose.yml` includes `redis` and a `worker` service;
      `run_worker.py` provides instructions for running a worker.
    - Gaps: Production-grade monitoring and observability could be enhanced.

  - File storage: DONE ✅
    - Status: A storage abstraction layer has been implemented (`storage.py`)
      with a `LocalFileSystemStorage` adapter. `services.AdapterService`
      now uses the configured storage backend.
    - Evidence: `storage.py` contains the `file_exists` helper;
      `services.py` calls it via `AdapterService.validate_file_path`.
    - Gaps: An S3/MinIO adapter has not been implemented yet.

  - Migrations (Alembic): DONE ✅
    - Status: Alembic scaffolding is in place, and an initial migration has been
      generated. The database schema is now under version control.
    - Files present: `alembic.ini`, `alembic/env.py`, `alembic/script.py.mako`,
      `alembic/versions/5f681a8fe826_initial.py` and `alembic/README.md`.
    - How to apply migrations locally:

      ```bash
      . .venv/bin/activate
      PYTHONPATH=$(pwd) alembic upgrade head
      ```

    - Note: For production Postgres usage, set `DATABASE_URL` to your Postgres DSN
      before running `alembic upgrade head`.

  - API contract hardening (`response_model=` and RFC7807 details): DONE ✅
    - Status: The project now includes explicit Pydantic "read" models and key
      endpoints declare `response_model=`. This improves OpenAPI generation and
      reduces accidental field exposure. RFC7807-style problem detail handlers
      have been added to centralize error responses.
    - Evidence: `schemas.py` includes read/response models and routers reference
      them; `main.py` contains a central handler for RFC7807-style problem
      responses.

  - Observability (structured logging, metrics): PARTIAL ✅
    - Status: Structured logging with `structlog` is integrated.
    - Evidence: `logging_config.py` sets up structured JSON logging. `tasks.py`
      and other modules use it.
    - Gaps: Prometheus metrics are not yet integrated.

  - Security (auth/roles): PARTIAL ✅
    - Status: A simple, optional API key authentication is implemented. If the
      `API_KEY` environment variable is set, all endpoints require a valid
      `X-API-Key` header. If the variable is not set, the API remains open.
    - Evidence: `security.py` contains the dependency logic. `main.py` applies
      the dependency to all routers. `config.py` defines the `API_KEY` setting.

  - Performance & scaling: PARTIAL ⚠️
    - Status: `docker-compose.yml` provides separate `api` and `worker` services
      and `routers` support pagination (`limit`/`offset`) in adapters listing.
      There are no DB indexes or profiling/benchmarking artifacts.
    - Gaps: Add database indexes for frequently queried columns (e.g., `status`,
      `active`, `created_at`).

  Small TODOs and test hygiene

  - Update tests to use a temp DB per run: DONE ✅
    - Tests now create an isolated temporary SQLite DB per run by setting
      `DATABASE_URL` in the test harness. `db.py` respects the env var so the
      engine is configurable before app initialization.

  - Provide a docker-compose that wires Redis + Postgres + worker + API for easy
    integration testing: DONE ✅
    - `docker-compose.yml` now wires Redis, Postgres, API, and an RQ worker,
      providing a full integration environment.

  Quick next steps I can take (pick one) — low-risk order suggestions:

  1. Add database indexes to improve query performance (e.g., status, active, created_at) and prepare timezone migration.
  2. Implement an S3/MinIO storage adapter.
  3. Add Prometheus metrics for observability.
  4. Enhance security with role-based access control (RBAC).

  If you'd like, I can implement any one of the "Quick next steps" above. Tell
  me which and I'll scaffold the change, add tests, and run the fast validation
  (tests/lint) in this workspace.

