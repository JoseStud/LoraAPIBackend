# LoRA Manager

LoRA Manager is a full-stack project that combines a FastAPI backend with a Vue 3
single-page application to manage LoRA adapters, compose prompts, queue SDNext
image generation jobs, and surface analytics. The backend wires its features
through a service container and exposes versioned `/api/v1` routes, while the
frontend provides dashboards, galleries, and admin workflows built on Pinia
stores and shared composables.

## Project status

The repository reflects an MVP that already implements the core workflows but
still expects several optional services during day-to-day use. The backend app
mounts routers for adapter metadata, generation, import/export, analytics,
recommendations, system status, and WebSocket progress updates, and defaults to
an on-disk SQLite database when no `DATABASE_URL` is supplied.【F:backend/main.py†L10-L96】【F:backend/core/database.py†L14-L61】

Many features are designed to work without heavy infrastructure, yet the best
experience comes from enabling the optional dependencies:

- Redis improves background processing; the queue orchestrator falls back to
  FastAPI background tasks when Redis is unavailable.【F:backend/services/queue.py†L15-L129】
- SDNext integration powers the image generation endpoints; without an SDNext
  server only validation responses are returned.【F:backend/delivery/sdnext.py†L17-L138】
- Recommendation features rely on optional ML dependencies and GPU support to
  pre-compute embeddings and serve similarity queries.【F:backend/services/recommendations/embedding_coordinator.py†L18-L102】【F:requirements-ml.txt†L1-L24】

## Implemented features

- **LoRA adapter management** – CRUD, tagging, bulk actions, and activation
  flows backed by SQLModel models and repository helpers.【F:backend/api/v1/adapters.py†L1-L151】【F:backend/models/adapters.py†L1-L46】
- **Prompt composition** – Compose active adapters into prompts with optional
  delivery orchestration.【F:backend/api/v1/compose.py†L1-L45】【F:backend/services/composition.py†L1-L128】
- **Generation pipeline** – Immediate and queued SDNext jobs with WebSocket
  telemetry and history presenters.【F:backend/api/v1/generation/__init__.py†L1-L11】【F:backend/api/v1/generation/jobs.py†L1-L52】【F:backend/api/v1/generation/results.py†L1-L63】【F:backend/services/generation/__init__.py†L1-L93】
- **Import/export and backups** – Estimate, stream, and ingest archives plus
  backup scheduling helpers exposed through dedicated endpoints.【F:backend/api/v1/import_export.py†L1-L115】【F:backend/services/archive/__init__.py†L1-L84】
- **Analytics dashboard data** – Aggregated KPIs, error breakdowns, and time
  series built from delivery history.【F:backend/api/v1/analytics.py†L1-L48】【F:backend/services/analytics/service.py†L1-L129】
- **AI-powered recommendations** – Similar-LoRA and prompt-based suggestions via
  the recommendation service facade.【F:backend/services/recommendations/service.py†L1-L119】【F:backend/api/v1/recommendations.py†L1-L118】
- **Vue 3 SPA** – Route-based views for dashboards, galleries, history, and
  admin panels backed by Pinia stores and composables.【F:app/frontend/src/router/index.ts†L1-L54】【F:app/frontend/src/views/DashboardView.vue†L1-L49】
- **Offline-friendly frontend** – A service worker caches the compiled SPA for
  basic offline support.【F:app/frontend/static/sw.js†L1-L90】

## Experimental features

- **Real-time progress WebSocket** – `/api/v1/ws/progress` broadcasts job
  updates through a dedicated WebSocket service, but the feature still lacks
  broad load testing and hardened error recovery, so treat it as
  experimental.【F:backend/api/v1/websocket.py†L1-L43】【F:backend/services/websocket/service.py†L1-L95】【F:docs/WEBSOCKET_IMPLEMENTATION.md†L120-L149】
- **Recommendation pipeline** – Endpoints are wired to the async recommendation
  service, yet production-quality behaviour depends on optional GPU-accelerated
  embeddings and several manual setup steps described in the design doc. Expect
  degraded results without that configuration.【F:backend/services/recommendations/service.py†L1-L119】【F:docs/RECOMMENDATION_MODEL_DESIGN.md†L7-L24】

## Getting started

### Docker-first development flow

The repository now ships with a single Docker Compose file that orchestrates the
API, frontend, PostgreSQL, Redis, and optional SDNext services. Hot reload is
preserved through bind mounts, so file changes trigger Uvicorn and Vite reloads
without leaving Docker.【F:docker-compose.dev.yml†L1-L104】【F:backend/containers/dev.Dockerfile†L1-L45】【F:app/frontend/containers/dev.Dockerfile†L1-L28】

1. (Optional) Copy `.env.docker.example` to `.env.docker` and adjust any values.
   The file controls Compose profiles, database URLs, API keys, and UID/GID
   overrides to avoid root-owned files on host machines.【F:.env.docker.example†L1-L13】
2. Start the stack with the helper target:

   ```bash
   make dev
   ```

   This command runs `docker compose up` with the development topology. The API
   is exposed on <http://localhost:8000>, and the Vite dev server on
   <http://localhost:5173>. Use `make dev-ml` to include the SDNext profile, and
   `make dev-logs` to tail all service logs.【F:Makefile†L1-L24】【F:docker-compose.dev.yml†L5-L104】

3. Stop the environment with `make dev-down`, or `make dev-clean` to also remove
   named volumes when you need a fresh database state.【F:Makefile†L17-L22】

### Manual (non-Docker) workflow

You can still run the backend and frontend directly on the host for lightweight
iterations or CI reproduction.

1. Install backend dependencies:

   ```bash
   pip install -r requirements.txt
   ```

   Add `requirements-ml.txt` if you plan to run the recommendation system with
   GPU-enabled embeddings.

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

   Set `BACKEND_URL` when the API listens on a different origin (for example
   the Docker container) and provide `VITE_BACKEND_API_KEY` so requests inherit
   the required `X-API-Key` header. The backend exposes a normalised payload via
   `/frontend/settings`, so the SPA reads the same configuration in Docker and
   local modes.【F:package.json†L5-L31】

## Testing

The repository ships with Python unit/integration tests, Vitest suites for Vue
components, Playwright end-to-end specs, and optional Lighthouse checks.

- Python: `pytest`
- Frontend unit tests: `npm run test:unit`
- Frontend integration tests: `npm run test:integration`
- E2E tests: `npm run test:e2e`

Use `npm run test` for the fast Vitest-only loop and `npm run test:all` to combine
unit and Playwright coverage when you need the full browser suite.

Not all suites run out of the box without additional services. Redis, SDNext,
and headless browsers must be available for the queue, generation, and E2E
tests respectively.【F:package.json†L18-L30】【F:tests/README.md†L70-L113】

## Production builds

Run `npm run prod:build` to emit a production bundle. The script sets
`ENVIRONMENT=production` via `cross-env` before invoking the standard build so
it works consistently on POSIX shells and Windows terminals.【F:package.json†L12-L24】

## Unified quality workflow

Execute `npm run ci:check` to reproduce the checks that CI runs. The helper
script performs Ruff format/lint passes, runs the backend settings pytest,
executes ESLint and TypeScript checks, and finishes by compiling the frontend
bundle.【F:package.json†L22-L31】【F:scripts/ci_check.py†L1-L38】

## Documentation

- [Developer guide](docs/DEVELOPMENT.md) – Architecture overview and workflow
  tips.
- [API contract](docs/contract.md) – Endpoint descriptions and expected
  behaviour.
- [Implementation status](docs/IMPLEMENTATION_COMPLETE.md) – Feature checklist
  and roadmap.
- [Testing guide](tests/README.md) – Detailed instructions for each suite.

## Known limitations

- Authentication is limited to an optional API key header; there is no user
  management yet.【F:backend/core/security.py†L1-L17】
- Queueing defaults to in-process execution when Redis is not configured; use
  Redis for production resilience.【F:backend/services/queue.py†L52-L119】
- The recommendation system depends on optional ML packages and GPU support for
  best performance.【F:requirements-ml.txt†L1-L24】
- SDNext integration assumes an external SDNext server and does not yet cover
  ControlNet or img2img flows.【F:backend/delivery/sdnext.py†L17-L138】

