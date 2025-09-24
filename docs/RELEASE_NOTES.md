# Release Notes

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
