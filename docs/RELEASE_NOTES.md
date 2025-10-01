# Release Notes

## Unreleased – Generation Studio Hardening

- **Shared orchestrator lifecycle:** The new manager store provisions a single generation orchestrator instance, tracks consumer subscriptions, and exposes queue state so views reuse one transport binding.【F:app/frontend/src/features/generation/composables/useGenerationOrchestratorManager.ts†L1-L223】【F:app/frontend/src/features/generation/stores/useGenerationOrchestratorStore.ts†L30-L608】
- **Queue visibility refinements:** Result retention honours configurable history limits and refreshes after backend reconnections or history toggles, keeping the UI in sync without exhausting API quotas.【F:app/frontend/src/features/generation/stores/useGenerationOrchestratorStore.ts†L267-L606】【F:app/frontend/src/features/history/composables/useGenerationHistory.ts†L33-L340】
- **Catalog & recommendation alignment:** A shared adapter catalog store now powers both gallery and recommendation views, reusing async resource caching and exposing summary helpers for other features.【F:app/frontend/src/features/lora/stores/adapterCatalog.ts†L19-L246】【F:app/frontend/src/features/recommendations/composables/useLoraSummaries.ts†L1-L52】
- **Runtime validation coverage:** Generation payloads, history responses, and queue updates are parsed through Zod schemas before reaching stores to stabilise transport behaviour across browsers and deployments.【F:app/frontend/src/schemas/generation.ts†L1-L111】【F:app/frontend/src/features/history/services/historyService.ts†L22-L139】
- **Networking resilience:** The async resource composable deduplicates pending fetches and `useApi` automatically aborts superseded calls, eliminating race-induced state thrashing on rapid filter changes.【F:app/frontend/src/composables/shared/useAsyncResource.ts†L129-L256】【F:app/frontend/src/composables/shared/useApi.ts†L62-L132】
- **Deployment-friendly defaults:** Polling intervals resolve from runtime config or backend settings, and Vue Router consumes the Vite base URL so sub-path hosting works without manual patches.【F:app/frontend/src/features/generation/config/polling.ts†L1-L153】【F:app/frontend/src/router/index.ts†L1-L75】
- **Generation façade hardened:** External consumers now rely on `useGenerationOrchestratorFacade()`, which exposes telemetry (`pendingActionsCount`, `lastActionAt`, `lastCommandError`) and logs for queue/history commands while generation stores are marked `@internal` and shielded by lint rules.【F:app/frontend/src/features/generation/orchestrator/facade.ts†L1-L213】【F:app/frontend/src/features/generation/stores/connection.ts†L1-L10】【F:.eslintrc.cjs†L1-L123】

## 2.1.0 – Vue SPA Consolidation

- **SPA Everywhere:** Dashboard, generation studio, LoRA management, history review, and admin tools are now served exclusively through Vue Router views backed by shared Pinia stores.
- **Legacy Removal:** Alpine.js and HTMX bundles were deleted from `app/frontend/static/js/`, and FastAPI now serves only the Vite-generated SPA shell.
- **Tooling Alignment:** npm scripts, linting, and type-checking run solely against Vue sources; Vitest + Playwright cover unit, integration, and end-to-end scenarios.
- **Documentation Refresh:** README, migration guide, and onboarding docs now describe the Vue-only stack so downstream teams know Alpine assets are no longer shipped.
- **Operational Guidance:** Tailwind builds compile from `static/css/input.css`, and new release consumers should run `npm install && npm run build` to generate SPA assets before deploying FastAPI.

## 2.2.0 – Backend Compatibility Cleanup

- **Service Registry Simplification:** `ServiceRegistry.infrastructure` was removed; use the existing `ServiceRegistry.application` facade for application-tier dependencies.
- **Explicit ASGI Factories:** `backend.main` now exposes `create_app()` and an ASGI factory callable instead of a pre-instantiated `app`. Callers should import `create_app` (or run `uvicorn backend.main:app --factory`) to obtain a configured backend application.
- **Docstring Enforcement:** Temporary Ruff docstring exemptions for services and workers were dropped, re-enabling full documentation linting across backend modules.
