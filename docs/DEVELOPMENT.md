# LoRA Manager – Developer guide

This guide highlights the structure of the project and the practical steps for
working on the codebase. The information reflects the current MVP
implementation rather than an aspirational future state.

## Architecture overview

- **Backend** – A FastAPI application that mounts versioned routers for
  adapters, composition, deliveries, generation, recommendations, analytics,
  import/export, system status, and WebSocket progress updates. Dependency
  management flows through `ServiceContainerBuilder`, which assembles domain and
  infrastructure registries on demand.【F:backend/main.py†L10-L96】【F:backend/services/service_container_builder.py†L1-L200】
- **Persistence** – SQLModel models back the API. The default configuration
  creates an on-disk SQLite database, but any SQLAlchemy-compatible engine can
  be supplied through `DATABASE_URL`.【F:backend/models/adapters.py†L1-L46】【F:backend/core/database.py†L14-L61】
- **Background work** – The queue orchestrator uses Redis/RQ when configured and
  falls back to FastAPI background tasks. A `DeliveryRunner` bridges queued jobs
  to delivery backends.【F:backend/services/queue.py†L15-L129】
- **External services** – SDNext powers image generation, and the recommendation
  system loads optional ML dependencies for embedding workflows. Both degrade
  gracefully when unavailable but return limited results.【F:backend/delivery/sdnext.py†L17-L138】【F:backend/services/recommendations/embedding_coordinator.py†L18-L102】
- **Frontend** – A Vue 3 SPA with route-based views, Pinia stores, and
  composables. Modules under `app/frontend/src/components` and
  `app/frontend/src/composables` mirror the backend features, and a service
  worker cached build enables offline routing.【F:app/frontend/src/router/index.ts†L1-L54】【F:app/frontend/static/sw.js†L1-L88】

## Backend layout

```
backend/
├── api/v1/                 # FastAPI routers per feature area
├── core/                   # Configuration, DB session helpers, security
├── models/                 # SQLModel entities for adapters and deliveries
├── schemas/                # Pydantic request/response models
├── services/               # Service container, facades, and providers
├── delivery/               # Pluggable delivery backends (SDNext, HTTP, storage)
└── workers/                # RQ worker utilities and background tasks
```

Key concepts:

- `ServiceContainerBuilder` composes `CoreServiceRegistry`,
  `DomainServiceRegistry`, and `InfrastructureServiceRegistry` objects so each
  request receives the correct service graph. Use
  `service_container_builder_scope()` when you need an isolated container for a
  test or request; it stores the active builder in context-local storage so
  overrides never leak across async tasks.【F:backend/services/__init__.py†L1-L70】
- WebSockets are handled by `backend/api/v1/websocket.py`, which delegates to
  `WebSocketService` for subscription management and broadcasting.
- Import/export flows live under `backend/services/archive`, exposing
  planners, executors, and backup helpers through the application service
  registry.

## Frontend layout

```
app/frontend/
├── src/
│   ├── features/           # Self-contained feature packages (generation, lora, history, etc.)
│   │   ├── components/     # Feature-scoped components
│   │   ├── composables/    # Feature-specific logic (orchestrator, catalog helpers, ...)
│   │   └── stores/         # Pinia stores marked @internal to the feature
│   ├── components/         # Cross-feature UI primitives
│   ├── composables/        # Shared logic (import/export, API helpers)
│   ├── services/           # HTTP clients and SDK-like helpers
│   ├── router/             # SPA router configuration
│   ├── views/              # Route-level shells that assemble feature packages
│   └── utils/              # Generic utilities shared across the SPA
├── static/                 # Tailwind input files and service worker
└── public/                 # Static assets served by Vite
```

Feature packages encapsulate their stores and orchestration logic so consumers import
from the feature barrel (for example, `@/features/generation/orchestrator`). Composables such as
`useJobQueue`, `useGenerationStudio`, and `useImportExport` reuse backend endpoints, while views
stitch together feature components to deliver the dashboard and admin experience.【F:app/frontend/src/features/generation/composables/useJobQueue.ts†L1-L46】【F:app/frontend/src/features/generation/composables/useGenerationStudio.ts†L1-L118】【F:app/frontend/src/views/DashboardView.vue†L1-L49】

### Generation orchestrator architecture

The generation feature exposes queue, history, and transport state through a dedicated façade and
manager pair. `useGenerationOrchestratorManager()` provisions a single orchestrator instance,
attaches watchers for backend URL changes and history toggles, and tears everything down when the
last consumer releases the binding. Downstream code accesses read-only queue/results snapshots and
command helpers via `useGenerationOrchestratorFacade()`, which adds telemetry such as
`pendingActionsCount` and `lastCommandError` for UI feedback.【F:app/frontend/src/features/generation/composables/useGenerationOrchestratorManager.ts†L1-L223】【F:app/frontend/src/features/generation/orchestrator/facade.ts†L1-L212】

### Frontend API client conventions

All HTTP access for the SPA flows through `app/frontend/src/services/apiClient.ts`.
The module exposes typed helpers (e.g., `performRequest`, `requestJson`,
`fetchBlob`) that provide consistent header injection, error normalisation, and
response parsing. Composables such as `useApi` are thin wrappers around that
client and should be used when a reactive data/abort controller is required.【F:app/frontend/src/services/apiClient.ts†L1-L214】【F:app/frontend/src/composables/shared/useApi.ts†L1-L133】

New services should favour the client helpers instead of manually calling
`fetch`. Reintroducing one-off clients was the root cause of the previous
duplication between `utils/api`, `services/apiClient`, and `useApi`. Centralising
logic in the shared client avoids regressions like missing authentication
headers or inconsistent error payload handling.【F:app/frontend/src/services/apiClient.ts†L96-L214】【F:app/frontend/src/composables/shared/useApi.ts†L41-L126】

## Local development

### Docker workflow

`docker-compose.dev.yml` provides the canonical developer topology: FastAPI with
hot reload, the Vite dev server, PostgreSQL, Redis, and an optional SDNext
profile. Bind mounts keep reload latency low while allowing editors to work
against the host filesystem.【F:docker-compose.dev.yml†L1-L104】【F:backend/containers/dev.Dockerfile†L1-L45】【F:app/frontend/containers/dev.Dockerfile†L1-L28】

1. Copy `.env.docker.example` to `.env.docker` when you need to override API
   keys, database URLs, or UID/GID mappings. The Makefile defaults to the
   example file so the stack works out-of-the-box.【F:.env.docker.example†L1-L13】【F:Makefile†L1-L24】
2. Run `make dev` to build the dev images (with caching) and start the
   containers. The API listens on port `8000` and the frontend dev server on
   port `5173`. `make dev-ml` enables the SDNext profile, while `make dev-down`
   and `make dev-clean` stop the stack and optionally remove volumes.【F:Makefile†L5-L22】
3. Inspect logs with `make dev-logs` or `docker compose logs -f`. Attach a
   debugger via the exposed ports (e.g., VS Code remote interpreter pointing to
   `api` on port `8000`).

Environment variables in `.env.docker` automatically flow into the containers.
For example, set `API_KEY` to change the backend API key or `VITE_BACKEND_URL`
to point the SPA at a different API instance.【F:docker-compose.dev.yml†L24-L104】

### Manual workflow (fallback)

You can still run everything locally without Docker when debugging container
issues or reproducing CI environments:

1. Install backend dependencies with `pip install -r requirements.txt` (add
   `requirements-amd.txt` or `requirements-ml.txt` for GPU workflows).
2. Install Node dependencies with `npm install`.
3. Launch `uvicorn backend.main:app --reload --port 8000` for the API.
4. Start `npm run dev` for the frontend. `npm run dev:full` and
   `npm run dev:backend` remain available convenience scripts.【F:package.json†L5-L31】

The backend still emits `/frontend/settings` so the SPA receives consistent
configuration in both Docker and manual setups. Use `npm run prod:build` when
you need an optimized bundle; the script relies on `cross-env` so production
flags are applied consistently across shells.【F:package.json†L12-L24】

### External dependencies

- **Database** – Defaults to SQLite; set `DATABASE_URL` for PostgreSQL or other
  engines.
- **Redis** – Optional but recommended for production-grade queuing.
- **SDNext** – Required for real image generation; without it, generation
  endpoints return validation output only.
- **ML models** – Install `requirements-ml.txt` and ensure GPU support for the
  recommendation service to run in real time.

## Testing

- Python tests: `pytest`
- Frontend unit tests: `npm run test:unit`
- Frontend integration tests: `npm run test:integration`
- Playwright E2E tests: `npm run test:e2e`

Some suites depend on Redis, SDNext, or browser binaries. Refer to
`tests/README.md` for instructions on enabling or skipping those integrations.【F:package.json†L18-L30】【F:tests/README.md†L70-L140】

### Manual QA checklist

- **LoRA gallery virtualization smoke test** – Seed the gallery with at least 200 adapters (either via the admin import workflow
  or by posting synthetic entries to the API), load the LoRA management page, and scroll through both the grid and list layouts.
  Confirm that scrolling stays smooth without perceptible lag, selection toggles still latch immediately, and bulk
  activate/deactivate/delete actions operate on the items chosen in the virtualized viewport.

## Code quality automation

Run `npm run ci:check` to trigger the same Ruff, pytest, ESLint, and TypeScript
checks that execute in CI, followed by the production Vite build. The command
is a thin wrapper around `scripts/ci_check.py`, making it easy to keep local
changes aligned with automation.【F:package.json†L22-L31】【F:scripts/ci_check.py†L1-L38】

- **Ruff formatting and linting** – Run `ruff format` and `ruff check` (or
  `pre-commit run --all-files`) before pushing changes. CI executes the same
  commands and will block merges on violations.【F:.pre-commit-config.yaml†L1-L11】【F:.github/workflows/ci.yml†L1-L41】
- **Docstring staged rollout** – Docstring enforcement is active for public API
  modules. Service-layer packages, workers, and migrations currently carry a
  temporary exception while historical debt is documented. TODO comments in
  `pyproject.toml` outline the follow-up work to remove those per-file ignores
  once the legacy modules gain documentation.【F:pyproject.toml†L1-L36】【F:pyproject.toml†L37-L48】

Install the project `pre-commit` hooks with `pre-commit install` to receive the
same checks locally. Hooks auto-format code and surface lint issues prior to
commit, matching the CI environment.【F:.pre-commit-config.yaml†L1-L11】

## Work in progress

- Authentication currently relies on a single API key header; multi-user support
  is not implemented yet.【F:backend/core/security.py†L1-L17】
- Delivery queue resilience depends on external Redis; production deployments
  should configure the primary backend instead of relying on the fallback.
- SDNext coverage focuses on txt2img; img2img, ControlNet, and additional
  pipelines remain future enhancements.【F:backend/delivery/sdnext.py†L17-L138】
- Recommendation workflows assume optional ML dependencies; expect degraded
  behaviour when those packages are missing.【F:requirements-ml.txt†L1-L24】

