# Generation Architecture Acceptance Criteria Cross-check

This checklist confirms that the post-refactor generation stack satisfies the review criteria. Each section links to the implementation that enforces the requirement.

## Orchestrator Façade

- The orchestrator store is a thin façade composed of queue, results, system-status, and transport modules. It exports readonly state and explicit lifecycle/data-loading methods with no internal watchers.【F:app/frontend/src/features/generation/stores/useGenerationOrchestratorStore.ts†L1-L210】
- Manager-owned watchers (`showHistory`, backend URL) live in `useGenerationOrchestratorManager`, not inside the store. The orchestrator exposes methods such as `handleBackendUrlChange` that the manager calls explicitly.【F:app/frontend/src/features/generation/composables/useGenerationOrchestratorManager.ts†L94-L206】
- Store logic is partitioned into helper modules (queue/results/system status/transport) that keep the façade near the 200-line target; orchestration logic itself stays within a single `defineStore` body while helpers encapsulate complex behaviour.【F:app/frontend/src/features/generation/stores/orchestrator/queueModule.ts†L1-L132】【F:app/frontend/src/features/generation/stores/orchestrator/transportModule.ts†L1-L129】

## Unified Networking

- `httpClient` centralises fetch handling, retries, logging hooks, and parsing strategies. The shared HTTP entry (`services/shared/http`) and `useApi` consume it to provide consistent error handling for all requests.【F:app/frontend/src/services/httpClient.ts†L1-L188】【F:app/frontend/src/services/shared/http/index.ts†L1-L163】【F:app/frontend/src/composables/shared/useApi.ts†L1-L128】
- Generation services (`generationService`, queue client, websocket manager) depend on the shared API client or transport adapter rather than bespoke fetch utilities.【F:app/frontend/src/features/generation/services/generationService.ts†L1-L176】【F:app/frontend/src/features/generation/services/queueClient.ts†L1-L148】

## Clean Module Boundaries

- Feature exports route through `features/generation/public.ts`, avoiding global barrels and keeping private helpers internal.【F:app/frontend/src/features/generation/index.ts†L1-L9】【F:app/frontend/src/features/generation/public.ts†L1-L120】
- Helper modules live alongside their feature (e.g., orchestrator submodules) and expose typed interfaces consumed by the façade, preventing incidental re-exports.【F:app/frontend/src/features/generation/stores/orchestrator/adapterHandlers.ts†L1-L168】

## Manager-Owned Effects

- The orchestrator manager owns the lifecycle scope via `effectScope`, registering watchers for history visibility and backend URL changes, and tearing them down when the last consumer releases the orchestrator.【F:app/frontend/src/features/generation/composables/useGenerationOrchestratorManager.ts†L94-L204】
- Transport adapters implement retry/polling callbacks but require the manager/store to invoke them—no helper starts background work automatically.【F:app/frontend/src/features/generation/composables/createGenerationTransportAdapter.ts†L1-L218】
- Components consume orchestrator state through the manager-provided binding (`useGenerationOrchestrator`), ensuring subscriptions tie to component lifecycles.【F:app/frontend/src/features/generation/composables/useGenerationOrchestrator.ts†L1-L23】

## Schema-First Consistency

- All generation payloads/results pass through Zod schemas before entering stores, normalising IDs, statuses, and nullable fields.【F:app/frontend/src/schemas/generation.ts†L1-L160】
- Queue modules rely on schema-parsed jobs/results and normalisation utilities before storing them in reactive state, ensuring store data matches schema outputs.【F:app/frontend/src/features/generation/stores/orchestrator/queueModule.ts†L1-L70】【F:app/frontend/src/features/generation/stores/orchestrator/resultsModule.ts†L1-L156】

## Robust Observability & Recovery

- The transport module records connection phases, retry counts, downtime, and last errors, exposing immutable metrics for debugging.【F:app/frontend/src/features/generation/stores/orchestrator/transportModule.ts†L1-L123】
- Tests exercise transport recovery, orchestrator lifecycle, and error handling to guarantee deterministic behaviour (e.g., reconnect scheduling, metrics reset, initialization idempotence).【F:tests/vue/stores/orchestrator/transportModule.spec.ts†L28-L128】【F:tests/vue/stores/useGenerationOrchestratorStore.spec.ts†L51-L196】
- Queue client tests confirm HTTP error reporting, ensuring logging metadata is preserved for observability.【F:tests/vue/useGenerationQueueClient.spec.ts†L134-L181】

Collectively, these artefacts validate that the refactored architecture remains modular, observable, and resilient, aligning with the review’s expectations.
