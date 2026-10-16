# LoRA Manager – Agent Guide

Working notes for anyone (human or agent) changing this repository. This file
describes where things live and what must stay true. It is not a status report:
do not add self-assessments here or as report files in the repo root. The
current state of the project is whatever `npm run ci:check` says.

## Definition of done

A change is not done until **`npm run ci:check` passes locally** and CI is green
on the PR. Never merge while `Unified quality checks` or
`Production build validation` fails. Do not claim a fix works without running
the checks it touches. A PR that changes an invariant described in this file
updates this file in the same PR.

`ci:check` (`scripts/ci_check.py`) runs, in order:

1. Repository guardrails: no legacy frontend paths, no deep cross-feature
   imports, and the ESLint guardrail fixtures in `tests/guardrails/` must
   *fail* lint. Never "fix" those fixtures by changing their imports.
2. `ruff format --check .` and `ruff check .` (ruff is pinned; `format.preview`
   output changes between releases).
3. API types up to date: regenerates
   `app/frontend/src/types/generated/backend.ts` from
   `backend.main.create_app().openapi()` into a temp file and fails if it
   differs from the committed file. Fix it with `npm run generate:api-types`
   (never by hand-editing `backend.ts`), then fix any type errors and commit
   both.
4. `pytest` (full backend suite).
5. `npm run lint` (ESLint, including import-boundary rules).
6. `npm run test:unit` (Vitest).
7. `npm run build` (`vue-tsc --noEmit` type-check, then Vite build).
8. `npm run check:bundle` (dashboard bundle budget and JobQueue code-splitting).

Individual commands:

```bash
pip install -r requirements.txt -r dev-requirements.txt   # Python 3.11
npm ci
npm run generate:api-types   # after any API schema change; needs the Python deps
pytest
npm run lint
npm run test:unit
npx vue-tsc --noEmit
npm run build
```

## Stack

- **Backend**: FastAPI, SQLModel, Alembic, Redis/RQ (in-process runner when
  `REDIS_URL` is unset).
  Python 3.11.
- **Frontend**: Vue 3 + TypeScript, Pinia, Vue Router, Vite, Zod.
- **Generation**: an external SDNext install on the host (see
  `docs/CUSTOM_SETUP.md`); the Docker dev stack connects to it.
- **ML (optional)**: PyTorch (ROCm), sentence-transformers, FAISS. Every ML
  import is lazy and guarded; the core app and the test suite run without them.

## Dependencies, migrations, environments

- **Python deps**: `requirements.txt` and `dev-requirements.txt` are lockfiles.
  Edit `requirements.in` / `dev-requirements.in`, then run `make deps-lock`
  (needs `uv`). `requirements-ml.txt` is the optional ML stack, constrained by
  the core lock. `sqlmodel` is held below 0.0.45, whose new `UTCDateTime`
  default changes how plain `datetime` fields behave; bump it only in its own
  PR. Datetime columns declare `sa_type=DateTime(timezone=True)`, which that
  change leaves alone ([Data model](docs/wiki/Data-Model.md#version-constraints)).
- **Migrations**: `backend/migrations` is the only Alembic tree (root
  `alembic.ini`); the app runs it on startup via `backend/core/migrations.py`.
  Add a revision there for every schema change and check with
  `alembic upgrade head` + `alembic check` on an empty database.
- **Dev environment**: `make dev` (`docker-compose.dev.yml`, configured by
  `.env.docker`). There is no other supported Docker stack. It sets
  `REDIS_URL`, so the API only enqueues generation jobs and the `worker`
  service (an RQ worker) runs them; the API and worker share `./outputs` as
  `SDNEXT_OUTPUT_DIR`.
- **Single API process**: the API runs as one uvicorn process (no `--workers`,
  no replicas), because the WebSocket `ConnectionManager` lives in a module
  global (`backend/services/websocket/service.py`) and the one lifespan-owned
  `JobProgressMonitor` loop broadcasts through it. Run one RQ worker on the
  `default` queue too: it carries generation and recommendation jobs, and
  SDNext renders one job at a time with global progress and interrupt
  endpoints, so a second worker would overlap with the first.
- **Security**: single-user, trusted-LAN tool. The API key is served to the
  browser by `/frontend/settings` and is not an access control (README,
  "Security model"). Don't build features that assume real authentication, and
  never return exception text to clients.

## Architecture orientation

Read these before changing the matching subsystem:

- **ADR 007 – Generation orchestrator as thin façade**
  (`docs/architecture/adr-generation-orchestrator-thin-facade.md`): how the
  orchestrator store, composables and helpers divide responsibilities.
- **Effect scope ownership playbook**
  (`docs/frontend/effect-scope-ownership-playbook.md`): where timers, watchers
  and event handlers live and who disposes them.
- **Generation architecture acceptance checklist**
  (`docs/frontend/generation-architecture-acceptance.md`): regression list for
  the orchestrator refactor.

### Backend contract map

- **Composition and startup**: `backend/main.py` mounts every public router
  under `/v1`. Its lifespan runs `init_db()` (Alembic migrations), preloads the
  recommendation models in the background, and runs the optional startup
  importer (`IMPORT_ON_STARTUP`). Delivery and generation backends (SDNext
  included) are registered by `ensure_delivery_system()` (`backend/delivery`),
  which the lifespan and `WorkerContext.build_default` call; importing the
  package registers nothing. Reach the registry through
  `get_delivery_registry()`, which runs the same idempotent registration.
  Add endpoints through the routers, not ad hoc routes.
- **Route handlers and the event loop**: database, file and other blocking
  work never runs on the event loop. A handler that only does synchronous work
  is a plain `def` (FastAPI runs it in the threadpool). An `async def` handler
  must await something and runs its synchronous steps through
  `run_in_threadpool` (services use `asyncio.to_thread`, as
  `SystemService.get_system_status_payload` does).
  `tests/api/test_route_handlers.py` fails on an `async def` handler that never
  awaits.
- **Service container**: `ServiceRegistry`
  (`backend/services/service_registry.py`) is the only container. It holds one
  database session and exposes every service as a flat, lazily built
  `cached_property` (`services.adapters`, `services.deliveries`,
  `services.storage`, ...). Each service is built by a field of the frozen
  `ServiceFactories` dataclass in the same file. A default is the service
  class itself when the registry's arguments map straight onto its
  constructor, otherwise a `make_*` function in `service_registry.py`
  (`get_websocket_service` returns the process-wide WebSocket service).
  Registries come
  from `ServiceContainerBuilder`
  (`backend/services/service_container_builder.py`);
  `get_service_container_builder()` (`backend/services/__init__.py`) returns
  one process-wide builder, so its cached queue orchestrator and GPU check are
  shared by every request and worker. Routers take
  `services: ServiceRegistry = Depends(get_services)`
  (`backend/core/dependencies.py`); tests override `get_services` or swap
  factories with `builder.with_overrides(factories=lambda f: replace(f, ...))`
  inside `service_container_builder_scope()`, which exists only for tests and
  scripts. Get services from a built registry instead of instantiating them
  directly; direct instantiation skips the locking and cache invalidation that
  protect long-running workers.
- **Queue orchestration**: `QueueOrchestrator` (`backend/services/queue.py`)
  sends jobs to Redis/RQ when `REDIS_URL` is set and to
  `BackgroundTaskQueueBackend` only when it is not. Enqueue through
  `QueueOrchestrator.enqueue_delivery()` (or `DeliveryService.enqueue_job`).
  With Redis configured a failed enqueue never moves the job in-process, where
  it would run beside the RQ worker and recovery would never requeue it: the
  orchestrator raises `QueueUnavailableError`, `DeliveryService.enqueue_job`
  fails the still-pending job, and the API answers 503. The fallback hands
  every job to the process-wide
  `InProcessJobRunner` (`backend/services/in_process_jobs.py`): one thread with
  one long-lived event loop that runs jobs one at a time in FIFO order, because
  SDNext renders one job at a time and its progress and interrupt endpoints are
  global. Never run in-process jobs from request threads or per-job
  `asyncio.run`. The lifespan stops the runner on shutdown. Services take a
  `TaskScheduler` (the protocol in `queue.py`), not FastAPI's `BackgroundTasks`;
  routers pass `BackgroundTasks`, which fits it, but the in-process fallback
  ignores it. `RedisQueueBackend` enqueues every job with an RQ `Retry` built
  from `DELIVERY_MAX_RETRIES` and `DELIVERY_RETRY_INTERVAL_SECONDS`
  (exponential delays, so workers run `rq worker --with-scheduler`); the
  in-process fallback runs each job once. Don't build a separate retry policy
  at call sites. `DeliveryHTTPClient` keeps one aiohttp session per event loop, so
  the shared SDNext client works from the API loop, the runner loop and RQ
  workers alike. RQ tasks run each job on a fresh loop on the worker's main
  thread (RQ's job timeout is a SIGALRM there) through `run_with_fresh_loop`
  (`backend/delivery`), which closes the sessions the generation backends
  opened on that loop before it ends; use it rather than a bare `asyncio.run`
  in worker code.
- **Job status transitions**: a delivery job moves `pending`/`retrying` →
  `running` → `succeeded`/`failed`/`retrying`, or to `cancelled` from any
  active status. Change status through `DeliveryService.claim_job`,
  `finish_job` and `cancel_job`, which are conditional single-statement
  updates (`DeliveryJobRepository.transition_job_status`), so a runner and a
  cancel request cannot both win; there is no unconditional status setter, so
  don't add one or write `status` any other way. Tests that need a job in a
  given state use `tests/util/delivery_jobs.py`. A runner that cannot claim a
  job skips it, which makes re-enqueueing safe. Cancelling a running job goes
  through `GenerationCoordinator.cancel_job`, which also interrupts the
  backend. `retrying` means an RQ retry is pending: the runner sets it when
  the backend raises and RQ's `retries_left` (the retries after this attempt)
  is above 0, otherwise `failed`; an RQ job timeout is always `failed`.
  Claiming from `retrying` restarts `started_at`. A retry of a job that was
  cancelled, or that a killed attempt left `running`, skips it; job recovery
  fails the latter.
- **Progress scale**: every `progress` the API emits (the REST queue's
  `GenerationJobStatus`, `SDNextGenerationResult`, the WebSocket's
  `ProgressUpdate`) is a fraction in [0, 1], where 1 means complete; the
  schemas declare `ge=0, le=1`. Values entering from storage or a generation
  backend go through `to_progress_fraction` (`backend/utils/progress.py`),
  which reads values above 1 as legacy stored percentages. REST and the
  WebSocket report the same fraction for the same stored job (completed jobs
  report 1.0). The frontend keeps progress as a fraction and converts it to a
  percentage only for display, with `toProgressPercent`
  (`app/frontend/src/utils/progress.ts`); never guess the scale from the value.
- **Job recovery**: `JobRecovery` (`backend/services/job_recovery.py`), started
  by the lifespan, fails jobs `running` longer than
  `JOB_RUNNING_TIMEOUT_SECONDS` (also the RQ job timeout) at startup and every
  `JOB_RECOVERY_INTERVAL_SECONDS`. Without Redis it fails every running job at
  startup and requeues the waiting ones, which lived only in the old process,
  through the orchestrator onto the same in-process runner as new requests.
  Tests stub `JobRecovery.start` (autouse fixture in `tests/conftest.py`).
- **Progress WebSocket**: one `JobProgressMonitor`
  (`backend/services/websocket/job_monitor.py`), started and stopped by the
  lifespan, produces every `generation_started`, `progress_update` and
  `generation_complete` from persisted job state; handlers and services never
  broadcast job messages or start per-job monitoring. Each
  `SDNEXT_POLL_INTERVAL` tick loads the active jobs, the recently finished
  ones and the tracked ones in one query in a thread
  (`DeliveryJobRepository.list_monitored_jobs`), sends `generation_started`
  when it first sees a job `running` (a claim), polls SDNext's global progress
  only for the running job, and sends `generation_complete` when a job leaves
  the active set as `succeeded`/`failed`; a `cancelled` job is dropped without
  one. With no subscribed connection a tick does nothing (no query, no SDNext
  call). Tests stub `JobProgressMonitor.start` (autouse fixture in
  `tests/conftest.py`) and drive `tick()` directly.
- **Configuration**: runtime settings live only in `backend/core/config.py`, so
  startup validation and the frontend `/frontend/settings` payload stay
  consistent.
- **Generated API types**: `app/frontend/src/types/generated/backend.ts` is
  generated from `backend.main.create_app().openapi()`, exported without a
  server by `scripts/export_openapi.py` (`npm run generate:api-types`). Only
  routes registered in `create_app()` are part of it; `app/main.py`'s
  `/frontend/settings` routes are not. A schema change ships with the
  regenerated file, or `ci:check` fails.
- **Stored job payloads**: `DeliveryJob.params` and `DeliveryJob.result` are
  JSON text, parsed and written only through `DeliveryJobParams` and
  `DeliveryJobResult` (`backend/schemas/delivery_jobs.py`) by
  `DeliveryJobMapper`. `DeliveryService.get_job_params` / `get_job_result`
  return the models; read their fields (`failure_message`, `status_message`,
  `generation_fields()`) instead of probing dict keys, and write failures as
  `error_message`. Legacy keys are normalised in the model, nowhere else
  ([Data model](docs/wiki/Data-Model.md#deliveryjob-deliveriespy)).
- **Result images**: job results store saved images as `output://` file
  references (relative to `SDNEXT_OUTPUT_DIR`), never base64; the browser
  loads them from the keyless `GET /v1/generation/results/{job_id}/images/{index}`
  (`backend/api/v1/generation/images.py`), which only serves files inside the
  output directory.
- **Recommendations**: GPU detection, model preloading and embedding
  workflows (per-adapter and batch computation, the similarity index) go
  through `EmbeddingService`
  (`backend/services/recommendations/embeddings.py`), reached from a request
  as `services.recommendations.embeddings`. `RecommendationService`
  (`service.py`) serves queries, stats and feedback and calls the functions in
  `strategies.py` directly; shared model instances live on
  `RecommendationModelRegistry` (`model_registry.py`). Long-running work (embedding computation, index rebuilds) is enqueued
  through `services.recommendation_jobs`, never run in the request.
  Both services and the strategies are synchronous (database, model loading,
  encoding): call them from plain `def` handlers or through
  `asyncio.to_thread`, as the worker tasks in `backend/workers/tasks.py` do.

### Frontend orchestration map

- **Generation orchestrator lifecycle**: views and components consume
  generation state only through `useGenerationOrchestratorManager`
  (`features/generation/composables/useGenerationOrchestratorManager.ts`).
  Every call to it is a thin wrapper over one Pinia store,
  `features/generation/stores/orchestratorManagerStore.ts`, which owns the
  consumers, the history limit, the backend-URL and history watchers and the
  visibility/online/offline listeners. Effects start on the first `acquire()`
  and stop when the last consumer releases, from any call site. Acquire
  bindings with `useGenerationOrchestratorManager().acquire(...)`; never create
  orchestrator instances inside components. A binding is the only lifecycle
  API and carries every command; `release()` (idempotent) is its only teardown
  method, after which the binding is inert: async commands and `initialize()`
  reject, sync commands do nothing, so a stale binding cannot bring the
  orchestrator back. `useGenerationOrchestratorFacade()`
  (`features/generation/orchestrator/facade.ts`) is a read-only view of the
  store: it registers no consumer and starts nothing. Dashboard widgets that
  need the orchestrator running call `useGenerationWidgetBinding(label)`,
  which acquires on mount (no history/backend sync, notifications logged
  rather than toasted) and releases on unmount. The Studio's binding and view
  state live in `features/generation/composables/useGenerationStudioController.ts`,
  composed by `useGenerationStudio.ts`; dashboard widgets must not import them.
  ADR 007's 2026-10-15 amendments have the full module map and the
  single-lifecycle decision.
- **Transport**: queue polling and WebSocket updates are wired in
  `features/generation/stores/orchestrator/transportAdapter.ts` (HTTP through
  `composables/useGenerationQueueClient.ts`, the socket through
  `services/websocketManager.ts`). Transport state, the store's transport
  commands and the routing of adapter callbacks into the store live in
  `features/generation/stores/orchestrator/transportModule.ts`. Extend those
  instead of adding polling to components. Polling intervals come from
  `features/generation/config/polling.ts`. `/system/status` has one poller per
  backend, `features/generation/stores/systemStatusController.ts`, shared by
  the Studio transport and the dashboard status card, and the transport's
  status refresh goes through it. Every other interval poller (the status
  controller, admin metrics, analytics auto-refresh) runs on
  `composables/shared/usePolling.ts`, which pauses the timer while the page is
  hidden or offline and runs once on resume; its listeners exist only between
  `start()` and `stop()`, so the owner must stop it. Build new pollers on it
  rather than on a bare `setInterval`. The progress socket's message
  shapes are pinned by `tests/fixtures/generation_websocket_contract.json`,
  checked from both sides (`tests/test_websocket_contract.py` and
  `websocketContract.spec.ts`); regenerate it with `UPDATE_WS_CONTRACT=1`
  only for a deliberate backend change, then fix
  `services/websocketMessages.ts`.
- **Shared state**: `features/generation/stores/useGenerationOrchestratorStore.ts`
  holds jobs, results (capped by the history limit) and system status, in
  `stores/orchestrator/queueModule.ts`, `resultsModule.ts` and
  `systemStatusModule.ts`; `useJobQueue`
  (`features/generation/composables/useJobQueueActions.ts`) only mirrors the
  manager's sorted queue. Snapshots are frozen with `freezeDeep` and throw on
  mutation in every build.
- **Adapter catalog**: `features/lora/stores/adapterCatalog.ts` caches adapter
  summaries for the gallery and recommendations; read it through
  `useAdapterSummaries` / `useLoraSummaries`.
- **Virtualized gallery**:
  `features/lora/components/lora-gallery/LoraGalleryGrid.vue` uses
  `vue-virtual-scroller`. Keep breakpoints in sync with container width and
  bulk-mode props, and call `forceUpdate()` after prop-driven size changes.
- **HTTP**: all requests go through `services/shared/http` (`performRequest`,
  `requestJson`, `createHttpClient`, ...) or `composables/shared/useApi`. Don't
  add bespoke `fetch` wrappers. Validate responses with the Zod schemas in
  `schemas/` and the feature `*Schemas.ts` files before they reach stores.
- **Feature boundaries**: import other features only through
  `features/<feature>/public`. ESLint and the `ci:check` guardrails enforce
  this; widen a `public.ts` deliberately instead of importing internals.

### Writing frontend tests

- The global setup (`tests/setup/vitest.setup.js`) creates a fresh Pinia per
  test and disposes its stores afterwards. Keep setup files free of app
  imports: anything they load is cached before a spec's `vi.mock()` runs, and
  the mock silently stops applying.
- Mock the module the code under test actually imports (for example
  `@/features/history/services/historyService`), not a barrel it no longer uses.
- Fixtures must satisfy the Zod schemas; `tests/fixtures/adapters.js` builds a
  valid adapter record.
- A spec named in the regression matrix below must contain real assertions;
  `it.todo` and skipped tests do not count as a check.
- Composables that share state through a store must be tested from multiple
  call sites (separate calls to the composable), not only through multiple
  `acquire()` calls on one returned instance: per-call watchers and listeners
  only misbehave in the first case.

## Cross-PR regression matrix

Run the relevant rows for cross-cutting PRs and note the results in the PR.

| Area | Expectation | How to check |
| --- | --- | --- |
| Orchestrator lifecycle | Consumers from separate call sites share one transport, one set of watchers and listeners, torn down once when the last releases | `npx vitest run tests/vue/composables/useGenerationOrchestratorManager.lifecycle.spec.ts tests/vue/composables/useGenerationOrchestratorManager.spec.ts tests/vue/composables/useGenerationOrchestratorManager.integration.spec.ts tests/vue/composables/useGenerationWidgetBinding.spec.ts` |
| Visibility / offline | Polling pauses while hidden or offline and resumes without duplicate jobs | DevTools Page Visibility and offline toggles; watch the network tab |
| Widgets without Studio | Dashboard widgets render without loading the Studio bundle | `npm run check:bundle`; load the dashboard route directly |
| HTTP errors | 401/403/5xx normalised; only idempotent requests retried; aborted requests never retried | `npx vitest run tests/vue/services/httpClient.spec.ts tests/vue/useApi.spec.ts` |
| Immutability | Store snapshots reject mutation; props typed `readonly` | `npx vitest run tests/vue/utils/freezeDeep.spec.ts`; `npx vue-tsc --noEmit` |
| Performance | Bundle budget holds; gallery stays smooth with 200+ adapters | `npm run check:bundle`; performance panel on the gallery |
| Boundaries | No deep cross-feature imports | `npm run lint` and `npm run ci:check` |
| Backend parity | API contract, queue fallback and migrations intact | `pytest`; `alembic upgrade head` and `alembic check` on an empty DB |
