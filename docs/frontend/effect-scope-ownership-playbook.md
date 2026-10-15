# Effect Scope Ownership Playbook

This guide describes where reactive side-effects (watchers, timers, event handlers) belong inside the frontend codebase. It codifies the conventions introduced during the orchestrator refactor so that new functionality does not leak resources or bypass centralised managers.

## Guiding principles

1. **Managers own long-lived effects.** Acquire generation behaviour through `useGenerationOrchestratorManager().acquire(...)`. The composable is a thin per-call wrapper; the consumers, the history limit, the backend URL and history watchers, the visibility/online/offline listeners and the orchestrator lifecycle all live in the `orchestratorManagerStore` Pinia store. The store creates them once, in an activation scope that is a child of its own effect scope, on the first `acquire()`, and stops that scope when the last consumer releases from any call site, when the orchestrator is destroyed, or when Pinia disposes the store. Calling the composable from several places never duplicates effects.【F:app/frontend/src/features/generation/stores/orchestratorManagerStore.ts†L285-L378】【F:app/frontend/src/features/generation/composables/useGenerationOrchestratorManager.ts†L26-L69】
2. **Components clean up what they start.** View-specific timers or watchers must live in `onMounted`/`onUnmounted` or `effectScope` blocks that are torn down when the component leaves. Prefer Pinia stores or composables that expose `initialize/cleanup` pairs.
3. **Helpers stay pure.** Queue modules, transport adapters, and schema normalisers should not register global listeners or timers. They expose methods for managers to call; helpers only mutate their own reactive state. (`app/frontend/src/features/generation/stores/orchestrator/queueModule.ts`, `app/frontend/src/features/generation/stores/orchestrator/transportAdapter.ts`)
4. **Unified networking handles retries.** All HTTP calls go through `httpClient` / `apiClient` (or the `useApi` composable) so retry policies, logging, and abort handling stay consistent. Do not spin up bespoke polling loops—reuse the transport adapter or orchestrator methods.【F:app/frontend/src/services/httpClient.ts†L1-L189】【F:app/frontend/src/composables/shared/useApi.ts†L1-L128】
5. **Reactive settings beats event buses.** To react to runtime configuration (like backend URL changes), watch the relevant Pinia store state instead of emitting custom events. The orchestrator manager store’s watchers demonstrate this pattern and automatically tear down when the last consumer leaves.【F:app/frontend/src/features/generation/stores/orchestratorManagerStore.ts†L325-L347】

## Pattern checklist

- Need an interval or retry loop? Add it to a manager/composable that exposes `initialize`/`cleanup`, and register it inside an `effectScope` so `stop()` handles disposal. Build polling intervals on `usePolling` (`app/frontend/src/composables/shared/usePolling.ts`): it pauses while the page is hidden or offline, runs once on resume, and attaches its `visibilitychange`/`online`/`offline` listeners only between `start()` and `stop()`. The owner calls `stop()` (or releases every `subscribe()`) from its own cleanup; `usePolling` does not register `onScopeDispose` itself, because shared controllers such as the admin-metrics poller outlive the component that first created them.
- Need to respond to backend configuration changes? Depend on `useSettingsStore()` and use watchers created inside an owned effect scope, as the manager store's `activate()` does, instead of a standalone emitter.【F:app/frontend/src/features/generation/stores/orchestratorManagerStore.ts†L349-L378】
- Need to monitor transport metrics? Access the readonly observability fields on the orchestrator store instead of subscribing to the WebSocket directly.【F:app/frontend/src/features/generation/stores/useGenerationOrchestratorStore.ts†L132-L210】
- Need to observe queue updates? Call orchestrator methods such as `loadActiveJobsData` or rely on manager-provided refs; never call `setInterval(fetchQueue)` inside a view.【F:app/frontend/src/features/generation/composables/useGenerationOrchestratorManager.ts†L36-L69】
- Need to extend helper behaviour? Add explicit callbacks (e.g., `onTransportError`) that the orchestrator wires up. Helpers should stay synchronous and side-effect free until invoked by the manager.【F:app/frontend/src/features/generation/stores/orchestrator/transportModule.ts†L1-L129】

## Anti-patterns

- Instantiating the orchestrator directly inside a component or composable.
- Creating `setInterval`, `watch`, or `window` event listeners inside queue/transport helpers.
- Performing API polling outside the orchestrator/manager, leading to duplicate requests and inconsistent error handling.
- Relying on global event buses for backend configuration or connection state—stick with reactive stores.

## Import boundaries

- Generation stores are **internal-only**. Import `useGenerationOrchestratorFacade()` (or manager bindings) when a feature needs queue/results state or commands. Direct `@/features/generation/stores/**` imports are lint errors outside the generation feature tree, and the stores are marked `@internal` to reinforce the boundary.【F:app/frontend/src/features/generation/orchestrator/facade.ts†L1-L213】【F:.eslintrc.cjs†L1-L123】
- The façade is read-only and has no lifecycle. When a view needs the orchestrator running or wants to trigger queue actions (`cancelJob`, `removeJob`, `refreshResults`, `setHistoryLimit`), it acquires a binding with `useGenerationOrchestratorManager().acquire(...)` and releases it from its own cleanup; dashboard widgets use `useGenerationWidgetBinding(label)`, which does both. Never mutate the Pinia stores.【F:app/frontend/src/features/generation/composables/useGenerationWidgetBinding.ts】

Following these rules keeps effects predictable, prevents leaks, and ensures future refactors remain straightforward.
