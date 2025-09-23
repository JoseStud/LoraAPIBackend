# Implementation status

This document captures the current state of the repository. It focuses on what
is implemented, what requires additional configuration, and the remaining gaps
that are tracked for future work.

## Implemented foundations

- **Service architecture** – `ServiceContainerBuilder` wires core, domain, and
  infrastructure registries, exposing adapter, generation, analytics, archive,
  recommendation, system, delivery, and WebSocket services to API routes.【F:backend/services/service_container_builder.py†L1-L200】【F:backend/services/service_registry.py†L1-L96】
- **Adapter lifecycle** – SQLModel-backed CRUD, bulk operations, tagging, and
  activation workflows exposed via the adapter router and service facade.【F:backend/models/adapters.py†L1-L46】【F:backend/api/v1/adapters.py†L1-L151】
- **Prompt composition & generation** – Composition helpers and SDNext-backed
  generation endpoints handle immediate and queued jobs with WebSocket
  broadcasting and presenter utilities for history/results views.【F:backend/services/composition.py†L1-L128】【F:backend/api/v1/generation.py†L1-L373】【F:backend/api/v1/websocket.py†L1-L55】
- **Import/export & backups** – Archive planner/executor, import validation, and
  backup helpers surface through the `/v1/export`, `/v1/import`, and `/v1/backups`
  endpoints.【F:backend/services/archive/__init__.py†L1-L84】【F:backend/api/v1/import_export.py†L1-L115】
- **Analytics** – The analytics service aggregates KPIs, error breakdowns, and
  time-series data, with derived insights feeding the dashboard and analytics
  pages.【F:backend/services/analytics/service.py†L1-L129】【F:backend/api/v1/analytics.py†L1-L48】
- **Frontend SPA** – Route-based views combine feature components, Pinia stores,
  and composables, while a 500+ line service worker provides offline caching and
  update management.【F:app/frontend/src/router/index.ts†L1-L54】【F:app/frontend/src/views/DashboardView.vue†L1-L49】【F:app/frontend/static/sw.js†L1-L88】
- **Testing scaffolding** – Pytest suites cover services and APIs, Vitest covers
  components/composables, and Playwright exercises end-to-end flows. Commands
  live in `package.json` and `tests/README.md`.【F:package.json†L5-L31】【F:tests/README.md†L70-L140】

## Requires configuration or optional dependencies

- **Database** – SQLite is used by default; production deployments should supply
  `DATABASE_URL` for PostgreSQL or another managed engine.【F:backend/core/database.py†L14-L61】
- **Redis** – Enables the primary RQ queue for background jobs. Without Redis,
  the orchestrator uses FastAPI background tasks which are best suited for
  development environments.【F:backend/services/queue.py†L52-L119】
- **SDNext** – Required for real image generation. The SDNext delivery backend
  returns failure responses when the SDNext API is unreachable or unconfigured.【F:backend/delivery/sdnext.py†L17-L138】
- **Recommendation ML stack** – Install `requirements-ml.txt` (and ensure GPU
  support) for embedding computation and similarity queries. Without these
  packages, recommendation endpoints degrade gracefully but may return limited
  data.【F:backend/services/recommendations/embedding_coordinator.py†L18-L102】【F:requirements-ml.txt†L1-L24】
- **Browser tooling** – Playwright, Lighthouse, and other browser-based tests
  require the corresponding binaries or CI images to be installed locally.

## Outstanding work

- **Authentication & authorization** – Only an optional API key header is
  enforced; user management and granular permissions remain out of scope.【F:backend/core/security.py†L1-L17】
- **Extended SDNext features** – img2img, ControlNet, retries, and richer error
  handling are future targets for the generation pipeline.【F:backend/delivery/sdnext.py†L52-L138】
- **Recommendation persistence** – Feedback endpoints and advanced analytics are
  scaffolds awaiting backing stores and ML fine-tuning.
- **Operational hardening** – Production runbooks should cover Redis, SDNext,
  worker processes, and monitoring/alerting integrations.
- **Test coverage tuning** – Several suites depend on optional infrastructure;
  dedicated CI pipelines or mocks are needed to keep coverage predictable.

---

Update this status document as features evolve. Its goal is to present an honest
view of the repository so new contributors can understand what works today and
what still needs attention.

