# ADR 007: Generation Orchestrator as Thin Façade

- **Status:** Accepted
- **Date:** 2025-09-XX
- **Authors:** Frontend platform team

## Context

Recent regressions exposed that different parts of the UI created bespoke generation orchestrators, layered ad-hoc watchers, and mutated shared state. The resulting race conditions and leaked subscriptions made recovery logic brittle, duplicated API handling, and reintroduced the very event-bus patterns that earlier refactors eliminated.

The generation flow now centres on three cooperating pieces:

1. **Generation Orchestrator Store** – a Pinia store that exposes immutable queue, results, transport, and system status state with explicit lifecycle and data-loading methods.
2. **Generation Orchestrator Manager** – a composable that owns the single orchestrator instance, coordinates initialization/cleanup, and binds watchers to component lifecycles.
3. **Generation Helpers** – queue/history modules, transport adapters, schema normalizers, and HTTP clients that encapsulate specialised logic.

We need an explicit decision record so future contributors preserve this architecture and avoid the anti-patterns that previously caused bugs.

## Decision

- Treat the orchestrator store as a **thin façade** over helper modules. It wires queue/history modules, the transport adapter, and system status controller together, but holds no long-lived watchers or side-effects beyond the explicit lifecycle methods it exposes.【F:app/frontend/src/features/generation/stores/useGenerationOrchestratorStore.ts†L1-L210】
- Publish only readonly reactive state (`jobs`, `recentResults`, transport metrics, etc.) and imperative methods (`initialize`, `loadRecentResults`, `startGeneration`, `handleBackendUrlChange`, etc.). Consumers must call methods to trigger work—no hidden behaviour should occur on property access.【F:app/frontend/src/features/generation/stores/useGenerationOrchestratorStore.ts†L74-L210】
- Keep helper responsibilities isolated:
  - Queue/history/system-status modules perform data shaping and state updates, including schema enforcement and normalisation.【F:app/frontend/src/features/generation/stores/orchestrator/queueModule.ts†L1-L132】【F:app/frontend/src/features/generation/stores/orchestrator/resultsModule.ts†L1-L214】【F:app/frontend/src/features/generation/stores/orchestrator/systemStatusModule.ts†L1-L200】
  - Transport modules and adapters encapsulate networking, reconnection, logging, and schema-validated parsing.【F:app/frontend/src/features/generation/stores/orchestrator/transportModule.ts†L1-L129】【F:app/frontend/src/features/generation/composables/createGenerationTransportAdapter.ts†L1-L218】
  - Managers/composables acquire orchestrator access, manage consumers, and attach watchers for UI-owned behaviour (history size, backend URL changes).【F:app/frontend/src/features/generation/composables/useGenerationOrchestratorManager.ts†L1-L223】
- Enforce **single-instance** orchestrator ownership. Components and features must obtain access through `useGenerationOrchestratorManager().acquire(...)`, ensuring initialization, teardown, and watchers are coordinated.【F:app/frontend/src/features/generation/composables/useGenerationOrchestrator.ts†L1-L23】【F:app/frontend/src/features/generation/composables/useGenerationOrchestratorManager.ts†L62-L204】
- All generation-side effects (polling, WebSocket lifecycle, queue refreshes) must run inside explicit orchestrator methods or manager-controlled watchers. No helper should start background work on import or instantiation.

## Consequences

### Positive

- Shared generation state remains deterministic and immutable to consumers.
- Watchers live only in scopes that can be disposed, preventing resource leaks and phantom updates.
- Transport and networking policies stay centralised, preserving consistent logging, retry, and schema handling.
- New integrations can extend helper modules without bloating the façade or breaking the single-instance contract.

### Negative / Trade-offs

- The orchestrator cannot be trivially instantiated in isolation; tests and new features must route through the manager or provide explicit dependency injections.
- Strict module boundaries require more boilerplate when introducing new side-effects (new helper hooks or manager watchers) but greatly reduce regressions.

### Anti-patterns to Avoid

- Creating new orchestrator instances inside components or composables—always acquire via the manager.
- Adding `watch`, `setInterval`, or event listeners inside queue/transport helpers. Effects belong to the manager or view-level scopes.
- Exporting helper internals through barrels that bypass the façade; expose new capabilities via orchestrator methods or typed helper interfaces.
- Introducing side-effects on property access (e.g., lazy network fetches when reading `recentResults`). Trigger work through explicit methods for traceability.

### Follow-up

- Document manager-owned effect patterns in the Effect Scope Ownership playbook.
- Keep the orchestrator under ~200 lines by moving new responsibilities into helper modules.
- Update tests when new helper methods are added to ensure the façade stays side-effect free.

## Addendum 2025-03 – Queue/Results Read-only Façade

- **Façade-only access.** External features (dashboard, summaries, admin views) must import `useGenerationOrchestratorFacade()` instead of reaching into Pinia stores. The façade now exposes immutable queue/result slices plus command helpers so consumers never mutate store internals directly.【F:app/frontend/src/features/generation/orchestrator/facade.ts†L1-L213】
- **Command telemetry.** The façade tracks `pendingActionsCount`, `lastActionAt`, and `lastCommandError` while logging start/success/error events for operations such as `cancelJob`, `refreshHistory`, and `setHistoryLimit`. These signals surface command latency and failure context without leaking store mutations to the UI layer.【F:app/frontend/src/features/generation/orchestrator/facade.ts†L94-L210】
- **Store encapsulation.** Generation store modules are marked `@internal` and no longer exported through public barrels. ESLint forbids `@/features/generation/stores/**` imports outside the feature directory so only façade consumers cross the boundary.【F:app/frontend/src/features/generation/stores/connection.ts†L1-L10】【F:.eslintrc.cjs†L1-L123】
