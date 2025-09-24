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
  telemetry and history presenters.【F:backend/api/v1/generation.py†L1-L373】【F:backend/services/generation/__init__.py†L1-L92】【F:backend/api/v1/websocket.py†L1-L55】
- **Import/export and backups** – Estimate, stream, and ingest archives plus
  backup scheduling helpers exposed through dedicated endpoints.【F:backend/api/v1/import_export.py†L1-L115】【F:backend/services/archive/__init__.py†L1-L84】
- **Analytics dashboard data** – Aggregated KPIs, error breakdowns, and time
  series built from delivery history.【F:backend/api/v1/analytics.py†L1-L48】【F:backend/services/analytics/service.py†L1-L129】
- **AI-powered recommendations** – Similar-LoRA and prompt-based suggestions via
  the recommendation service facade.【F:backend/services/recommendations/service.py†L1-L111】【F:backend/api/v1/recommendations.py†L1-L134】
- **Vue 3 SPA** – Route-based views for dashboards, galleries, history, and
  admin panels backed by Pinia stores and composables.【F:app/frontend/src/router/index.ts†L1-L54】【F:app/frontend/src/views/DashboardView.vue†L1-L49】
- **Offline-friendly frontend** – A service worker caches the compiled SPA for
  basic offline support.【F:app/frontend/static/sw.js†L1-L88】

## Getting started

1. **Install Python dependencies**

   ```bash
   pip install -r requirements.txt
   ```

   Add `requirements-ml.txt` if you plan to run the recommendation system with
   GPU-enabled embeddings.

2. **Install Node dependencies**

   ```bash
   npm install
   ```

3. **Run the backend**

   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

   The FastAPI backend is mounted at `/api/v1`, and the SPA is served from the
   `/` mount when built.

4. **Run the frontend dev server**

   ```bash
   npm run dev
   ```

   By default the SPA proxies requests to the backend on the same origin. Set
   the `BACKEND_URL` environment variable when the API runs on a different
   host (for example `http://localhost:8782` when hitting the Docker backend).
   Provide the API key through `VITE_BACKEND_API_KEY` (or the legacy
   `VITE_API_KEY`) so every request carries the required `X-API-Key` header.
   The backend surfaces these values through `/frontend/settings`, so no
   additional Python-side frontend configuration is required.

Useful combined workflows live in `package.json`, including `npm run dev:full`
to launch both servers and `npm run dev:backend` to serve the compiled frontend
from FastAPI.【F:package.json†L5-L31】

## Testing

The repository ships with Python unit/integration tests, Vitest suites for Vue
components, Playwright end-to-end specs, and optional Lighthouse checks.

- Python: `pytest`
- Frontend unit tests: `npm run test:unit`
- Frontend integration tests: `npm run test:integration`
- E2E tests: `npm run test:e2e`

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

