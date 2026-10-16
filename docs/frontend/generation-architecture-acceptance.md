# Generation Architecture Acceptance Criteria Cross-check

This checklist confirms that the post-refactor generation stack satisfies the review criteria. Each section names the module that enforces the requirement. Paths are relative to `app/frontend/src/features/generation/` unless they start with `app/` or `tests/`; the module map itself is in ADR 007 (`docs/architecture/adr-generation-orchestrator-thin-facade.md`, "Amendment 2026-10-15").

## Orchestrator Façade

- The orchestrator store is a thin façade composed of queue, results, system-status, and transport modules. It exports readonly state and explicit lifecycle/data-loading methods with no internal watchers (`stores/useGenerationOrchestratorStore.ts`).
- Manager-owned watchers (`showHistory`, backend URL) and the visibility/online/offline listeners live in the manager store, `stores/orchestratorManagerStore.ts`, not inside the orchestrator store. `composables/useGenerationOrchestratorManager.ts` is a thin per-call wrapper over it. The orchestrator exposes methods such as `handleBackendUrlChange` that the manager store calls explicitly.
- Store logic is partitioned into helper modules that keep the façade near the 200-line target: `stores/orchestrator/queueModule.ts`, `resultsModule.ts`, `systemStatusModule.ts` and `transportModule.ts` (transport state, `createTransportActions`, `createAdapterHandlers`). Orchestration logic itself stays within a single `defineStore` body.

## Unified Networking

- `services/shared/http` owns the only HTTP client: fetch handling, auth headers, retries, tracing and parsing are defined once in `createHttpClient.ts`, and `useApi` goes through it for consistent error handling (`app/frontend/src/services/shared/http/createHttpClient.ts`, `app/frontend/src/services/shared/http/index.ts`, `app/frontend/src/composables/shared/useApi.ts`).
- Generation services (`services/generationService.ts`, `services/queueClient.ts`, `services/websocketManager.ts`) depend on the shared API client or the transport adapter rather than bespoke fetch utilities.

## Clean Module Boundaries

- Feature exports route through `public.ts` and `public/widgets.ts`, avoiding global barrels and keeping private helpers internal. The feature has no other barrels.
- Helper modules live alongside their feature (e.g., `stores/orchestrator/`) and expose typed interfaces consumed by the façade, preventing incidental re-exports.

## Manager-Owned Effects

- The manager store owns the lifecycle scope via `effectScope`, registering watchers for history visibility and backend URL changes on the first `acquire()` and tearing them down when the last consumer releases the orchestrator, from any call site (`stores/orchestratorManagerStore.ts`).
- The transport adapter (`stores/orchestrator/transportAdapter.ts`) implements polling, the WebSocket and pause/resume, but starts nothing until the orchestrator store calls `initialize()`/`resume()`; no helper starts background work automatically.
- Components consume orchestrator state through bindings from `useGenerationOrchestratorManager().acquire(...)` (for example `composables/useGenerationStudioController.ts` and `composables/useJobQueueActions.ts`) or the façade, so subscriptions tie to component lifecycles.

## Schema-First Consistency

- All generation payloads/results pass through Zod schemas before entering stores, normalising IDs, statuses, and nullable fields (`app/frontend/src/schemas/generation.ts`).
- Queue modules rely on schema-parsed jobs/results and normalisation utilities before storing them in reactive state, ensuring store data matches schema outputs (`stores/orchestrator/queueModule.ts`, `stores/orchestrator/resultsModule.ts`).

## Robust Observability & Recovery

- The transport module records connection phases, retry counts, downtime, and last errors, exposing immutable metrics for debugging (`stores/orchestrator/transportModule.ts`).
- Tests exercise transport recovery, orchestrator lifecycle, and error handling to guarantee deterministic behaviour (e.g., reconnect scheduling, metrics reset, pause/resume, initialization idempotence): `tests/vue/stores/orchestrator/transportModule.spec.ts`, `tests/vue/stores/orchestrator/transportAdapter.spec.ts`, `tests/vue/stores/useGenerationOrchestratorStore.spec.ts`, `tests/vue/composables/useGenerationOrchestratorManager.lifecycle.spec.ts`.
- Queue client tests confirm HTTP error reporting, ensuring logging metadata is preserved for observability (`tests/vue/useGenerationQueueClient.spec.ts`).

Collectively, these artefacts validate that the refactored architecture remains modular, observable, and resilient, aligning with the review’s expectations.
