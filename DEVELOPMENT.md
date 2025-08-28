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
    - `validate_file_path(path)` - validates file paths using the local
      filesystem.
    - `save_adapter_from_payload(payload)` - converts payload to Adapter and
      persists it.
    - `list_active_adapters_ordered()` - composer helper that orders,
      deduplicates and returns adapters ready for token formatting.
    - `create_delivery_job(prompt, mode, params)` - inserts a DeliveryJob record.
    - `deliver_http`, `deliver_cli` - delivery helpers used by BackgroundTasks
      for simple, immediate deliveries.

  - `storage.py` - provides helpers for interacting with the local filesystem
    storage where LoRA models are stored.

  - `config.py` - defines and manages application configuration using
    Pydantic's `BaseSettings`. It loads settings from environment variables
    and provides a single `settings` object for app-wide use.


  Linting & docstring policy
  -------------------------

  We use `ruff` for linting and formatting. Key settings:
  - Line length: 88 characters.
  - Target Python: 3.10.
  - Rules: Standard error/warning rules plus import ordering, bugbear,
    comprehensions, and docstring checks.

  Run `ruff --fix` locally before committing.


  Design decisions
  ----------------

  - **Tags**: Stored as a JSON-encoded string in SQLite.
  - **Timezones**: All timestamps are timezone-aware UTC.
  - **Serialization**: Routers use `model_dump()` for serialization.
  - **Background work**: Simple tasks use `fastapi.BackgroundTasks`. Complex jobs
    use an RQ worker queue.

  Database Notes
  --------------

  The default database is SQLite. For production, you may want to migrate to
  PostgreSQL. This would involve:
  - Using a `JSONB` column for tags.
  - Ensuring primary keys and sequences are correctly configured.
  - Using a proper connection pool.
  - Adding `psycopg[binary]` to requirements.
  - Using Alembic to generate and apply migrations.


  Testing
  -------

  - Tests are in `tests/` and use an isolated in-memory SQLite database per run.
  - `test_main.py` covers the adapter lifecycle and delivery enqueuing.


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

  - File storage: PARTIAL ✅
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

