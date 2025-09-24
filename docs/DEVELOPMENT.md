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
  request receives the correct service graph.
- WebSockets are handled by `backend/api/v1/websocket.py`, which delegates to
  `WebSocketService` for subscription management and broadcasting.
- Import/export flows live under `backend/services/archive`, exposing
  planners, executors, and backup helpers through the application service
  registry.

## Frontend layout

```
app/frontend/
├── src/
│   ├── components/         # Feature-oriented component families
│   ├── composables/        # Shared logic for queues, analytics, etc.
│   ├── stores/             # Pinia stores coordinating state
│   ├── views/              # Route-level pages (dashboard, history, admin)
│   └── router/             # SPA router configuration
├── static/                 # Tailwind input files and service worker
└── public/                 # Static assets served by Vite
```

Composables such as `useJobQueue`, `usePerformanceAnalytics`, and
`useImportExport` reuse backend endpoints, while views stitch together feature
components to deliver the dashboard and admin experience.【F:app/frontend/src/composables/generation/useJobQueue.ts†L1-L207】【F:app/frontend/src/views/DashboardView.vue†L1-L49】

## Local development

1. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

   Use `requirements-amd.txt` or `requirements-ml.txt` when you need GPU-aware
   recommendations.

2. Install Node dependencies:

   ```bash
   npm install
   ```

3. Launch the backend with auto-reload:

   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

4. Start the Vite dev server:

   ```bash
   npm run dev
   ```

   `npm run dev:full` runs both servers concurrently, and `npm run dev:backend`
   serves the built frontend from FastAPI.【F:package.json†L5-L31】

   The backend owns the SPA runtime configuration. `/frontend/settings` returns
   a payload assembled from `backend.core.config.settings`, exposing a
   normalised `backendUrl` (relative paths default to `/api/v1`) and the
   optional `backendApiKey`. There is no longer a Python frontend package to
   configure separately.

Use `npm run prod:build` when you need an optimized bundle. The script now relies
on `cross-env` so the production `ENVIRONMENT` flag is applied on macOS/Linux and
Windows shells before the standard build executes.【F:package.json†L12-L24】

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

