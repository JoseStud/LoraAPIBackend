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
    - `validate_file_path(path)` - validates file paths using the configured
      storage adapter.
    - `save_adapter_from_payload(payload)` - converts payload to Adapter and
      persists it.
    - `list_active_adapters_ordered()` - composer helper that orders,
      deduplicates and returns adapters ready for token formatting.
    - `create_delivery_job(prompt, mode, params)` - inserts a DeliveryJob record.
    - `deliver_http`, `deliver_cli` - delivery helpers used by BackgroundTasks
      for simple, immediate deliveries.

  - `storage.py` - provides a storage abstraction layer (`Storage` protocol) and
    concrete implementations for different backends (e.g., `LocalFileSystemStorage`).
    A factory function `get_storage()` returns the configured adapter.

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

  - Tags storage: SQLite does not have a native JSON list mapping in this simple
    setup. To keep the schema stable the `tags` column stores a JSON-encoded
    string and routers decode/encode as-needed. With Postgres you can replace
    this with a JSONB column or a normalized tags table.
  - Timezones: all timestamps use timezone-aware UTC datetimes.
  - Serialization: routers use `model_dump()` to serialize SQLModel objects.
    Upgrading SQLModel and Pydantic versions may change serialization semantics;
    tests lock current expected behavior.
  - Background work: small, immediate tasks use `fastapi.BackgroundTasks`. A
    queue-backed worker flow (RQ) is scaffolded for asynchronous processing and is
    used by `tasks.py` for DeliveryJob processing in non-trivial runs.

  SQLite-specific considerations (for eventual PostgreSQL migration)

  - Purpose: keep common SQLite quirks and migration steps documented so switching
    to Postgres is predictable and auditable.
  - Data types and JSON/tags:
    - Current pattern: `tags` is stored as a JSON-encoded string because SQLite
      lacks a native JSONB type. On Postgres replace this with a JSONB column
      (preferred) or a normalized tags table.
    - Migration note: prefer JSONB + a GIN index for tag queries (faster,
      flexible). Alembic autogeneration may not detect JSON string -> JSONB; inspect
      generated migrations and adjust types manually.
  - Datetime & timezone:
    - Use timezone-aware UTC datetimes everywhere (already a repo convention).
      Postgres supports TIMESTAMP WITH TIME ZONE; ensure SQLModel/SQLAlchemy column
      types include timezone=True so Alembic can detect the change.
  - Primary keys, AUTOINCREMENT and sequences:
    - SQLite `INTEGER PRIMARY KEY` behaves like AUTOINCREMENT but Postgres
      requires SERIAL/BIGSERIAL or explicit sequences. When migrating, ensure
      primary key type and sequences are correct for expected scale.
  - Booleans & NULL semantics:
    - SQLite is loose about types; Postgres is strict. Verify boolean columns and
      NOT NULL constraints in migrations and tests.
  - Indexes & performance:
    - Add explicit indexes in models/migrations for fields used in WHERE/ORDER BY
      (e.g., `status`, `created_at`). Postgres benefits from typed indexes and
      partial indexes; plan them in Alembic migrations.
  - SQL dialect differences:
    - SQL functions and operators differ (e.g., `ILIKE` vs `LIKE`, JSON
      operators). Review raw SQL snippets or SQLAlchemy text queries before
      migration.
  - Connection pooling & tests:
    - SQLite in-process usage requires `connect_args={"check_same_thread":
      False}` and a small/no pool (we use NullPool in tests to avoid
      ResourceWarning). For Postgres use a proper connection pool (default
      SQLAlchemy QueuePool) and consider pool_pre_ping in long-lived processes.
  - Concurrency & transactions:
    - SQLite has database-level locking for writes; Postgres supports concurrent
      writers with row-level locking. Test concurrent worker behavior in Postgres
      specifically (delivery workers, migrations under load).
  - DDL and Alembic autogenerate caveats:
    - Alembic autogeneration may miss column type changes (JSON string -> JSONB,
      timezone flags); set `compare_type=True` in `env.py` and review diffs
      closely.
    - SQLite has limited ALTER TABLE support; migrations that require column
      redefinitions may be easy in Postgres but cumbersome in SQLite; prefer
      writing migrations which are compatible with the target DB or run them only
      against Postgres in CI.
  - Dependencies & drivers:
    - Add `psycopg[binary]` or `psycopg2-binary` to the production requirements
      for Postgres. Tests/CI should install the Postgres driver when running
      Postgres matrix jobs.
  - Testing & CI recommendations:
    - Add a CI matrix job that runs tests against Postgres (use a service in
      GitHub Actions or a testing container). Set `DATABASE_URL` in the job before
      importing the app so Alembic/SQLModel/engine are configured correctly.
    - Keep the SQLite-based tests for fast local runs but gate migration-sensitive
      tests (JSONB, partial indexes, concurrent writes) on the Postgres job.
    - Migration checklist (short):
      1. Add Postgres to `docker-compose` (service `postgres`) or add a Postgres
         service in CI.
      2. Install Postgres driver in CI and local env (e.g., `psycopg[binary]`).
      3. Set `DATABASE_URL` to Postgres DSN and run `alembic revision --autogenerate -m "initial"`.
      4. Review autogen migration: fix type changes (JSON -> JSONB), add
         indexes, and ensure sequences/serials are correct.
      5. Run `alembic upgrade head` against a test Postgres instance and run
         full test suite.
      6. Add a CI job that runs migrations + tests against Postgres on push/PR.

  Notes: these changes are intentionally conservative — write and review
  migrations by hand when they alter types or constraints. The repository already
  contains Alembic scaffolding (config and `env.py`) so creating an initial
  autogenerate revision is straightforward; review it before applying to Postgres.

  Testing

  - `tests/test_main.py` contains basic tests for health, adapter lifecycle, and
    enqueuing a delivery.
  - Tests now use an isolated temporary SQLite database per run by setting
    `DATABASE_URL` in the test setup. This avoids DB collisions in local runs and
    CI. The code in `db.py` respects `DATABASE_URL` so tests can control the
    engine before the app is initialized.

  Recommended next steps

  1) Worker queue
  - A Redis + RQ worker flow has been scaffolded and integrated. `tasks.py`
    contains the processing logic used by workers; `routers/deliveries.py` will
    enqueue when `REDIS_URL` is configured. A smoke test using `fakeredis` and
    `rq.SimpleWorker` exercises enqueue -> worker -> DB update.

    Gaps: add production-grade retry policies, backoff tuning and worker
    observability if you plan to run high-volume workloads.

  2) Storage adapter
  - A storage adapter has been implemented, decoupling file validation from the
    local filesystem. The new `storage.py` module defines a `Storage` protocol,
    a `LocalFileSystemStorage` implementation, and a `get_storage` factory.
    `services.validate_file_path` now uses the configured adapter. This makes
    it easy to add other backends like S3 in the future.

  3) Migrations
  - Alembic scaffolding has been added to the repository (config, `env.py`, and
    templates). Create an initial autogenerate revision with:

    ```bash
    PYTHONPATH=$(pwd) alembic revision --autogenerate -m "initial"
    PYTHONPATH=$(pwd) alembic upgrade head
    ```

    Review generated migrations carefully (JSON -> JSONB, timezone flags,
    indexes) before applying to Postgres.

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
    integration testing: PARTIAL ⚠️
    - `docker-compose.yml` wires Redis, API and an RQ worker; Postgres is not
      included by default and should be added for a full Postgres-backed
      integration environment.

  If you want, I can implement any of the recommended next steps. Tell me which
  one and I'll scaffold it, add tests, and run fast validation (tests/lint) in
  this workspace.

  Progress vs recommended next steps

  Below is a short status map comparing the "Recommended next steps" from this
  document to what exists in the codebase (short pointers to files). This is
  intended to help maintainers pick the next work with minimal discovery.

  - Worker queue: PARTIAL ✅
    - Status: A Redis + RQ-based worker flow has been scaffolded and integrated.
    - Evidence: `tasks.py` contains `process_delivery` which updates `DeliveryJob`
      status/result and uses `rq.Queue`; `routers/deliveries.py` will enqueue when
      `REDIS_URL` is set; `docker-compose.yml` includes `redis` and a `worker`
      service; `run_worker.py` documents how to run an RQ worker.
    - Gaps: some improvements have been made and tests added, but you may want
      production-grade retry/backoff and more observability before high-volume
      deployment.
      - Implemented: RQ-based scaffold, worker processing in `tasks.py`, and a
        smoke test using `fakeredis` + `rq.SimpleWorker`.
      - Files changed: `tasks.py`, `requirements.txt` (+ `fakeredis`),
        `tests/test_worker.py` (worker smoke test).
      - How to run (local):

        ```bash
        . .venv/bin/activate
        PYTHONPATH=$(pwd) pytest -q
        ```

      - Test results (local run): 4 passed.

  - Storage adapter (S3/MinIO abstraction): PARTIAL ✅
    - Status: A storage abstraction layer has been implemented (`storage.py`)
      with a `LocalFileSystemStorage` adapter. `services.validate_file_path`
      now uses the configured storage backend.
    - Evidence: `storage.py` contains the `Storage` protocol and implementations;
      `services.py` calls `get_storage().exists(path)`.
    - Gaps: An S3/MinIO adapter has not been implemented yet.

  - Migrations (Alembic): PARTIAL ✅
    - Status: Alembic scaffolding (config and env) has been added and is present
      in the repo. Create and review an autogenerate migration before applying to
      Postgres.
    - Files present: `alembic.ini`, `alembic/env.py`, `alembic/script.py.mako`,
      `alembic/versions/` and `alembic/README.md`.
    - How to create/apply migrations locally:

      ```bash
      . .venv/bin/activate
      PYTHONPATH=$(pwd) alembic revision --autogenerate -m "initial"
      PYTHONPATH=$(pwd) alembic upgrade head
      ```

    - Note: For production Postgres usage, set `DATABASE_URL` to your Postgres DSN
      before running `alembic upgrade head` and review generated migrations.

  - API contract hardening (`response_model=` and RFC7807 details): PARTIAL ⚠️
    - Status: The project now includes explicit Pydantic "read" models and key
      endpoints declare `response_model=`. This improves OpenAPI generation and
      reduces accidental field exposure.
    - Evidence: `schemas.py` includes read/response models and routers reference
      them; `main.py` contains a central handler for RFC7807-style problem
      responses.
    - How to run (local):

      ```bash
      . .venv/bin/activate
      PYTHONPATH=$(pwd) pytest -q
      ```

    - Test results (local run): full suite passes (4 passed).

  Why `response_model=` is important (short)

  - Stable API contract: `response_model` locks the output shape for clients and
    OpenAPI, reducing accidental schema drift when internal models change.
  - Serialization & validation: FastAPI/Pydantic will serialize returned objects
    according to the response model and validate them in debug modes, preventing
    leaking of internal fields (for example DB internals, hashes or internal
    metadata).
  - Clearer OpenAPI docs: response schemas appear in the generated OpenAPI,
    enabling clients (and `openapi-generator`) to generate correct client code
    and server stubs.
  - Consistency & defaults: you can control defaults, ordering, and exclude
    unset/none fields consistently across endpoints via Pydantic model config or
    FastAPI settings.
  - Safety & security: explicit models reduce accidental exposure of sensitive
    attributes and make it easier to add field-level transformations (for
    example: hide file paths or normalize timestamps).
  - Faster client development & testing: clients can rely on the contract in CI,
    and tests can assert schema shapes instead of ad-hoc dict shapes.

  If you want, I can now:

  - Add an OpenAPI assertion test that validates the presence of the main response
    schemas, or
  - Tighten response models further (e.g., set `response_model_exclude_none=True`,
    or add `alias`/`by_alias` behavior), or
  - Run a quick pass to remove any accidental internal fields from responses
    across routers.

  - Observability (structured logging, metrics): DEFERRED ❌
    - Status: No structured logging or Prometheus metrics integration detected.

  - Security (auth/roles): DEFERRED ❌
    - Status: No authentication or authorization present; endpoints are open.

  - Performance & scaling: PARTIAL ⚠️
    - Status: `docker-compose.yml` provides separate `api` and `worker` services
      and `routers` support pagination (`limit`/`offset`) in adapters listing.
      There are no DB indexes or profiling/benchmarking artifacts.

  Small TODOs and test hygiene

  - Update tests to use a temp DB per run: DONE ✅
    - Tests now create an isolated temporary SQLite DB per run by setting
      `DATABASE_URL` in the test harness. `db.py` respects the env var so the
      engine is configurable before app initialization. Local full test run: 4
      passed.

  - Provide a docker-compose that wires Redis + Postgres + worker + API for easy
    integration testing: PARTIAL ⚠️
    - `docker-compose.yml` wires Redis, API and an RQ worker; Postgres is not
      included by default and should be added for a full Postgres-backed
      integration environment.

  Quick next steps I can take (pick one) — low-risk order suggestions:

  1. Create an initial Alembic autogenerate revision (repo already has
     scaffolding).
  2. Implement a storage adapter interface (LocalFS + S3/MinIO stub) and update
     `validate_file_path` to use it.
  3. Harden the worker retry/backoff and add more worker observability.
  4. Tighten `response_model` usage and add an OpenAPI assertion test.

  Requirements coverage (short mapping)

  - Worker queue: Partial — RQ integration exists and a worker implementation is
    present (see `tasks.py`, `docker-compose.yml`).
  - Storage adapter: Deferred — only local FS validation in `services.py`.
  - Migrations: Partial — Alembic scaffolding present; create/review migrations
    before applying to Postgres.
  - API contract hardening: Partial — read/response models exist and are used on
    key endpoints.
  - Observability: Deferred — no structured logging / Prometheus metrics.
  - Security: Deferred — no auth or role checks.
  - Performance & scaling: Partial — compose separates api/worker and pagination
    exists; DB tuning and indexes missing.

  If you'd like, I can implement any one of the "Quick next steps" above. Tell
  me which and I'll scaffold the change, add tests, and run the fast validation
  (tests/lint) in this workspace.

  Reconciling `README.md` with current progress
  ---------------------------------------------

  The main `README.md` is slightly out of date and lists several items as "next
  steps" that have already been implemented or scaffolded. This section provides
  a short reconciliation map.

  - "Worker queue": `README.md` suggests implementing a worker.
    - Status: DONE ✅. An RQ-based worker is fully scaffolded and integrated. See
      `tasks.py`, `run_worker.py`, and `docker-compose.yml`.
  - "Migrations": `README.md` suggests adding an Alembic config.
    - Status: DONE ✅. Alembic is configured and ready for use. See `alembic.ini`
      and the `alembic/` directory.
  - "Serialization": `README.md` suggests using `response_model`.
    - Status: DONE ✅. Routers now use explicit Pydantic "read" models and
      `response_model` to harden the API contract.
  - "File storage": `README.md` suggests adding a storage abstraction.
    - Status: DONE ✅. A storage protocol and a local filesystem implementation
      exist in `storage.py`.

  The `README.md` should be updated to reflect these changes. For now, this
  document provides the most accurate status overview.
