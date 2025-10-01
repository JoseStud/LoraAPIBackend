# Effect Scope Ownership Playbook

This guide describes where reactive side-effects (watchers, timers, event handlers) belong inside the frontend codebase. It codifies the conventions introduced during the orchestrator refactor so that new functionality does not leak resources or bypass centralised managers.

## Guiding principles

1. **Managers own long-lived effects.** Acquire generation behaviour through `useGenerationOrchestratorManager().acquire(...)` so backend URL watchers, history limit adjustments, and orchestrator lifecycle are bound to a single shared manager scope.【F:app/frontend/src/features/generation/composables/useGenerationOrchestratorManager.ts†L62-L205】
2. **Components clean up what they start.** View-specific timers or watchers must live in `onMounted`/`onUnmounted` or `effectScope` blocks that are torn down when the component leaves. Prefer Pinia stores or composables that expose `initialize/cleanup` pairs.
3. **Helpers stay pure.** Queue modules, transport adapters, and schema normalisers should not register global listeners or timers. They expose methods for managers to call; helpers only mutate their own reactive state.【F:app/frontend/src/features/generation/stores/orchestrator/queueModule.ts†L1-L126】【F:app/frontend/src/features/generation/composables/createGenerationTransportAdapter.ts†L38-L210】
4. **Unified networking handles retries.** All HTTP calls go through `httpClient` / `apiClient` (or the `useApi` composable) so retry policies, logging, and abort handling stay consistent. Do not spin up bespoke polling loops—reuse the transport adapter or orchestrator methods.【F:app/frontend/src/services/httpClient.ts†L1-L189】【F:app/frontend/src/composables/shared/useApi.ts†L1-L128】
5. **Reactive settings beats event buses.** To react to runtime configuration (like backend URL changes), watch the relevant Pinia store state instead of emitting custom events. The orchestrator manager’s watchers demonstrate this pattern and automatically tear down when the last consumer leaves.【F:app/frontend/src/features/generation/composables/useGenerationOrchestratorManager.ts†L94-L159】

## Pattern checklist

- Need an interval or retry loop? Add it to a manager/composable that exposes `initialize`/`cleanup`, and register it inside an `effectScope` so `stop()` handles disposal.
- Need to respond to backend configuration changes? Depend on `useSettingsStore()` and use watchers similar to `ensureWatcherScope()` instead of a standalone emitter.【F:app/frontend/src/features/generation/composables/useGenerationOrchestratorManager.ts†L107-L159】
- Need to monitor transport metrics? Access the readonly observability fields on the orchestrator store instead of subscribing to the WebSocket directly.【F:app/frontend/src/features/generation/stores/useGenerationOrchestratorStore.ts†L132-L210】
- Need to observe queue updates? Call orchestrator methods such as `loadActiveJobsData` or rely on manager-provided refs; never call `setInterval(fetchQueue)` inside a view.【F:app/frontend/src/features/generation/composables/useGenerationOrchestratorManager.ts†L169-L206】
- Need to extend helper behaviour? Add explicit callbacks (e.g., `onTransportError`) that the orchestrator wires up. Helpers should stay synchronous and side-effect free until invoked by the manager.【F:app/frontend/src/features/generation/stores/orchestrator/transportModule.ts†L1-L129】

## Anti-patterns

- Instantiating the orchestrator directly inside a component or composable.
- Creating `setInterval`, `watch`, or `window` event listeners inside queue/transport helpers.
- Performing API polling outside the orchestrator/manager, leading to duplicate requests and inconsistent error handling.
- Relying on global event buses for backend configuration or connection state—stick with reactive stores.

Following these rules keeps effects predictable, prevents leaks, and ensures future refactors remain straightforward.
