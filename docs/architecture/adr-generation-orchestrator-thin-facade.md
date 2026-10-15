# ADR 007: Generation Orchestrator as Thin Façade

- **Status:** Amended (see [Amendment 2026-10-15](#amendment-2026-10-15--consolidated-module-map))
- **Date:** 2025-09-XX, amended 2026-10-15
- **Authors:** Frontend platform team

## Context

Recent regressions exposed that different parts of the UI created bespoke generation orchestrators, layered ad-hoc watchers, and mutated shared state. The resulting race conditions and leaked subscriptions made recovery logic brittle, duplicated API handling, and reintroduced the very event-bus patterns that earlier refactors eliminated.

The generation flow now centres on three cooperating pieces:

1. **Generation Orchestrator Store** – a Pinia store that exposes immutable queue, results, transport, and system status state with explicit lifecycle and data-loading methods.
2. **Generation Orchestrator Manager** – a Pinia setup store (`orchestratorManagerStore`) that owns the single orchestrator instance, its consumers, initialization/cleanup, and the shared watchers and environment listeners, fronted by the `useGenerationOrchestratorManager()` composable, a thin per-call wrapper.
3. **Generation Helpers** – queue/history modules, the transport adapter, schema normalizers, and HTTP clients that encapsulate specialised logic.

We need an explicit decision record so future contributors preserve this architecture and avoid the anti-patterns that previously caused bugs.

## Decision

- Treat the orchestrator store as a **thin façade** over helper modules. It wires queue/history modules, the transport adapter, and system status controller together, but holds no long-lived watchers or side-effects beyond the explicit lifecycle methods it exposes (`app/frontend/src/features/generation/stores/useGenerationOrchestratorStore.ts`).
- Publish only readonly reactive state (`jobs`, `recentResults`, transport metrics, etc.) and imperative methods (`initialize`, `loadRecentResults`, `startGeneration`, `handleBackendUrlChange`, etc.). Consumers must call methods to trigger work—no hidden behaviour should occur on property access.
- Keep helper responsibilities isolated:
  - Queue/history/system-status modules perform data shaping and state updates, including schema enforcement and normalisation (`stores/orchestrator/queueModule.ts`, `resultsModule.ts`, `systemStatusModule.ts`).
  - The transport module and adapter encapsulate networking, reconnection, logging, and schema-validated parsing (`stores/orchestrator/transportModule.ts`, `stores/orchestrator/transportAdapter.ts`).
  - The manager store acquires orchestrator access, manages consumers, and attaches watchers for UI-owned behaviour (history size, backend URL changes) plus the visibility/online/offline listeners. It creates them once, in its own effect scope, on the first `acquire()` and stops them when the last consumer releases, whichever call site it came from; `useGenerationOrchestratorManager()` only reads the store's refs and delegates `acquire()` (`stores/orchestratorManagerStore.ts`, `composables/useGenerationOrchestratorManager.ts`).
- Enforce **single-instance** orchestrator ownership. Components and features must obtain access through `useGenerationOrchestratorManager().acquire(...)`, ensuring initialization, teardown, and watchers are coordinated (`stores/orchestratorManagerStore.ts`).
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

- **Façade-only access.** External features (dashboard, summaries, admin views) must import `useGenerationOrchestratorFacade()` instead of reaching into Pinia stores. The façade now exposes immutable queue/result slices plus command helpers so consumers never mutate store internals directly (`app/frontend/src/features/generation/orchestrator/facade.ts`).
- **Command telemetry.** *(Superseded by the 2026-10-15 lifecycle amendment below.)* The façade tracked `pendingActionsCount`, `lastActionAt`, and `lastCommandError` around its commands.
- **Store encapsulation.** Generation store modules are marked `@internal` and no longer exported through public barrels. ESLint forbids `@/features/generation/stores/**` imports outside the feature directory so only façade consumers cross the boundary (`.eslintrc.cjs`).

## Amendment 2026-10-15 – Consolidated module map

**Why.** The submit → progress → results flow had grown to 63 modules (about 8.1k lines) under
`app/frontend/src/features/generation/`, many of them shims or layers that only forwarded callbacks
to the next layer. The bug fixed in #432 (each `useGenerationOrchestratorManager()` call site
creating its own watchers) lived in exactly those seams. The decision above is unchanged: the
orchestrator store is still a thin façade over queue, results, system-status and transport
helpers, the manager store still owns every long-lived effect, and nothing starts work on import.
What changed is that each responsibility now lives in one module instead of a chain of them
(45 modules, about 7.8k lines).

**Module map** (paths relative to `app/frontend/src/features/generation/`):

| Responsibility | Module |
| --- | --- |
| Public surface | `public.ts`, `public/widgets.ts` (dashboard widgets, no Studio code), `public/jobQueueWidget.ts` |
| Read-only façade for other features | `orchestrator/facade.ts` (aliased as `@/features/generation/orchestrator`) |
| Shared lifecycle: consumers, history limit, backend-URL and history watchers, visibility/online/offline listeners | `stores/orchestratorManagerStore.ts`, fronted by `composables/useGenerationOrchestratorManager.ts` (+ `.types.ts`) |
| Orchestrator store (thin façade) | `stores/useGenerationOrchestratorStore.ts` |
| Queue / results / system status state | `stores/orchestrator/queueModule.ts`, `resultsModule.ts`, `systemStatusModule.ts`, `stores/systemStatusController.ts` |
| Transport state, commands and callback routing | `stores/orchestrator/transportModule.ts` (`createTransportModule`, `createTransportActions`, `createAdapterHandlers`) |
| Transport adapter: HTTP polling + progress WebSocket, pause/resume/clear | `stores/orchestrator/transportAdapter.ts`, using `composables/useGenerationQueueClient.ts`, `services/websocketManager.ts`, `services/websocketMessages.ts` |
| Polling intervals | `config/polling.ts` |
| Studio building blocks and binding | `composables/useGenerationStudioController.ts` (`createStudioVm`, `createGalleryModalVm`, `useGenerationUI`, `useGenerationStudioController`) |
| Studio composable used by the shell | `composables/useGenerationStudio.ts` (+ `useGenerationPersistence.ts`, `useGenerationStudioNotifications.ts`) |
| Dashboard widgets | `components/JobQueue.vue` (`useJobQueue`, `useJobQueueActions` in `composables/useJobQueueActions.ts`), `components/system/*` (`composables/useSystemStatus.ts`) |

**Merged or deleted, and why:**

- *Shims:* `stores/results.ts`, `stores/queue.ts`, `stores/connection.ts`, `services/updates.ts`,
  `composables/useGenerationOrchestrator.ts` and `composables/useJobQueue.ts` only re-exported or
  wrapped another module. Their importers now use the real module (`useJobQueue` moved into
  `useJobQueueActions.ts`, the JobQueue widget's other composable).
- *Dead barrels:* `composables/index.ts`, `components/index.ts`, `services/index.ts` and the
  feature-root `index.ts` had no importers outside two specs.
- *Transport chain:* `useGenerationTransport`, `createGenerationTransportAdapter` and
  `useGenerationSocketBridge` passed the same callback set through three layers; they are one
  adapter, `stores/orchestrator/transportAdapter.ts`. `transportActions.ts` and
  `adapterHandlers.ts` moved into `transportModule.ts`. `useGenerationUpdates` had no importers.
  `GenerationNotificationAdapter` moved to `types/transport.ts`.
- *Studio chain:* `vm/createStudioVm.ts`, `vm/createGalleryModalVm.ts`, `composables/useGenerationUI.ts`
  and `controller/useGenerationStudioController.ts` are one module,
  `composables/useGenerationStudioController.ts`; `useGenerationStudio` composes it. The
  `controller/` and `vm/` directories are gone. The deprecated `JobQueue` export left
  `public.ts`; `JobQueueWidget` replaces it.

**Unchanged on purpose:** the queue, results and system-status modules and `orchestrator/facade.ts`
keep their own files and responsibilities. The adapter stays separate from `transportModule.ts` so
tests can replace it with `vi.mock()` without replacing the transport state, and the view models
stay outside `useGenerationStudio.ts` so its spec can spy on them across a module boundary.

## Amendment 2026-10-15 – One lifecycle API

**Why.** The façade had a second lifecycle beside `acquire()`: `ensureInitialized()` /
`releaseIfLastConsumer()` registered "read-only consumers" in a separate set on the manager store,
and the façade wrapped every binding command with its own `pendingActionsCount`,
`lastActionAt` and `lastCommandError`. That state was created per call to
`useGenerationOrchestratorFacade()`, so two components showed different pending counts for the
same orchestrator, and teardown depended on two consumer sets agreeing.

**Decision.**

- `useGenerationOrchestratorFacade()` is a read-only view: selectors only, no lifecycle, no
  commands, no per-call state. Reading it never starts the transport.
- `useGenerationOrchestratorManager().acquire(...)` is the only way to keep the orchestrator
  running or to send a command. The manager store has one consumer set; `hasActiveConsumers` is
  `consumers.size > 0`.
- Dashboard widgets that previously used the façade lifecycle (`SystemStatusCard`, `JobQueue`)
  call `useGenerationWidgetBinding(label)`, which acquires on mount with `autoSync: false`, logs
  notifications instead of toasting them (the manager broadcasts to every consumer, so toasting
  would duplicate the Studio's toasts) and releases on unmount.
- The binding gained `removeJob` and `clearCompletedJobs`, the two façade commands it lacked.
  `useJobQueueActions` sends all three queue commands through its binding; `cancelJob` takes the
  backend job id.

`tests/vue/composables/useGenerationWidgetBinding.spec.ts` mounts widgets from separate components
and checks that they share one orchestrator, which is destroyed after the last unmounts and kept
while the Studio still holds a binding.

