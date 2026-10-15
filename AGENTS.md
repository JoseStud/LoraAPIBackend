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
3. `pytest` (full backend suite).
4. `npm run lint` (ESLint, including import-boundary rules).
5. `npm run test:unit` (Vitest).
6. `npm run build` (`vue-tsc --noEmit` type-check, then Vite build).
7. `npm run check:bundle` (dashboard bundle budget and JobQueue code-splitting).

Individual commands:

```bash
pip install -r requirements.txt -r dev-requirements.txt   # Python 3.11
npm ci
pytest
npm run lint
npm run test:unit
npx vue-tsc --noEmit
npm run build
```

## Stack

- **Backend**: FastAPI, SQLModel, Alembic, Redis/RQ with an in-process fallback.
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
  the core lock. `sqlmodel` is held below 0.0.45: newer releases need
  timezone-aware datetimes and `TIMESTAMPTZ` columns, which requires its own
  migration.
- **Migrations**: `backend/migrations` is the only Alembic tree (root
  `alembic.ini`); the app runs it on startup via `backend/core/migrations.py`.
  Add a revision there for every schema change and check with
  `alembic upgrade head` + `alembic check` on an empty database.
- **Dev environment**: `make dev` (`docker-compose.dev.yml`, configured by
  `.env.docker`). There is no other supported Docker stack. It sets
  `REDIS_URL`, so the API only enqueues generation jobs and the `worker`
  service (an RQ worker) runs them; the API and worker share `./outputs` as
  `SDNEXT_OUTPUT_DIR`.
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
- **Service container**: `ServiceRegistry`
  (`backend/services/service_registry.py`) is the only container. It holds one
  database session and exposes every service as a flat, lazily built
  `cached_property` (`services.adapters`, `services.deliveries`,
  `services.storage`, ...). Each service is built by a field of the frozen
  `ServiceFactories` dataclass, whose defaults are the `make_*` functions in
  `backend/services/providers/`. Registries come from `ServiceContainerBuilder`
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
  picks Redis/RQ when available and falls back to `BackgroundTaskQueueBackend`.
  Enqueue through `QueueOrchestrator.enqueue_delivery()` so the fallback keeps
  working. Services take a `TaskScheduler` (the protocol in `queue.py`), not
  FastAPI's `BackgroundTasks`; routers pass `BackgroundTasks`, which fits it.
- **Job status transitions**: a delivery job moves `pending`/`retrying` →
  `running` → `succeeded`/`failed`/`retrying`, or to `cancelled` from any
  active status. Change status through `DeliveryService.claim_job`,
  `finish_job` and `cancel_job`, which are conditional single-statement
  updates (`DeliveryJobRepository.transition_job_status`), so a runner and a
  cancel request cannot both win; don't write `status` with
  `update_job_status` from the runner or the API. A runner that cannot claim a
  job skips it, which makes re-enqueueing safe. Cancelling a running job goes
  through `GenerationCoordinator.cancel_job`, which also interrupts the
  backend.
- **Job recovery**: `JobRecovery` (`backend/services/job_recovery.py`), started
  by the lifespan, fails jobs `running` longer than
  `JOB_RUNNING_TIMEOUT_SECONDS` (also the RQ job timeout) at startup and every
  `JOB_RECOVERY_INTERVAL_SECONDS`. Without Redis it fails every running job at
  startup and requeues the waiting ones, which lived only in the old process.
  Tests stub `JobRecovery.start` (autouse fixture in `tests/conftest.py`).
- **Configuration**: runtime settings live only in `backend/core/config.py`, so
  startup validation and the frontend `/frontend/settings` payload stay
  consistent.
- **Result images**: job results store saved images as `output://` file
  references (relative to `SDNEXT_OUTPUT_DIR`), never base64; the browser
  loads them from the keyless `GET /v1/generation/results/{job_id}/images/{index}`
  (`backend/api/v1/generation/images.py`), which only serves files inside the
  output directory.
- **Recommendations**: GPU detection and embedding workflows go through
  `EmbeddingCoordinator`
  (`backend/services/recommendations/embedding_coordinator.py`).

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
  orchestrator instances inside components. The Studio's binding and view
  state live in `features/generation/composables/useGenerationStudioController.ts`,
  composed by `useGenerationStudio.ts`; dashboard widgets must not import them.
  ADR 007's 2026-10-15 amendment has the full module map.
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
| Orchestrator lifecycle | Consumers from separate call sites share one transport, one set of watchers and listeners, torn down once when the last releases | `npx vitest run tests/vue/composables/useGenerationOrchestratorManager.lifecycle.spec.ts tests/vue/composables/useGenerationOrchestratorManager.spec.ts tests/vue/composables/useGenerationOrchestratorManager.integration.spec.ts` |
| Visibility / offline | Polling pauses while hidden or offline and resumes without duplicate jobs | DevTools Page Visibility and offline toggles; watch the network tab |
| Widgets without Studio | Dashboard widgets render without loading the Studio bundle | `npm run check:bundle`; load the dashboard route directly |
| HTTP errors | 401/403/5xx normalised; only idempotent requests retried; aborted requests never retried | `npx vitest run tests/vue/services/httpClient.spec.ts tests/vue/useApi.spec.ts` |
| Immutability | Store snapshots reject mutation; props typed `readonly` | `npx vitest run tests/vue/utils/freezeDeep.spec.ts`; `npx vue-tsc --noEmit` |
| Performance | Bundle budget holds; gallery stays smooth with 200+ adapters | `npm run check:bundle`; performance panel on the gallery |
| Boundaries | No deep cross-feature imports | `npm run lint` and `npm run ci:check` |
| Backend parity | API contract, queue fallback and migrations intact | `pytest`; `alembic upgrade head` and `alembic check` on an empty DB |
