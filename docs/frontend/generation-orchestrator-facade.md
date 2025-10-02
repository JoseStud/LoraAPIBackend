# Generation Orchestrator Façade Contract

The generation feature surfaces its queue, history, and transport state through the
`useGenerationOrchestratorFacade()` helper located in
`app/frontend/src/features/generation/orchestrator/facade.ts`. The façade is the only public
entry-point for orchestration behaviour; Pinia stores and helper modules remain `@internal` to
the feature package so callers cannot bypass lifecycle guarantees introduced during the recent
manager refactor.

## Public API

```ts
import { useGenerationOrchestratorFacade } from '@/features/generation/orchestrator';
import type { GenerationOrchestratorFacade } from '@/features/generation/orchestrator';
```

The `@/features/generation/orchestrator` barrel exports both the factory and the façade type.
It wires together the orchestrator store, the manager store, and the shared notification
adapter so that every consumer interacts with a single, shared orchestrator instance.

## Read-only selectors

All selectors resolve to immutable snapshots backed by the orchestrator store. They expose
queue, history, and transport state without leaking mutable references:

- `queue`, `jobs`, `activeJobs`, `sortedActiveJobs`, `hasActiveJobs`, `jobsByBackendId` – queue
  views derived from the façade's underlying Pinia store.
- `results`, `recentResults`, `historyLimit` – recent history constrained by the configured
  retention settings.
- `systemStatus`, `systemStatusReady`, `systemStatusLastUpdated`, `systemStatusApiAvailable`,
  `queueManagerActive` – backend availability snapshots sourced from the system status module.
- `isActive`, `isConnected`, `pollIntervalMs` – orchestrator lifecycle markers, including the
  active transport polling cadence.
- `transportMetrics`, `transportPhase`, `transportReconnectAttempt`,
  `transportConsecutiveFailures`, `transportNextRetryDelayMs`, `transportLastConnectedAt`,
  `transportLastDisconnectedAt`, `transportDowntimeMs`, `transportTotalDowntimeMs`,
  `lastError`, `lastSnapshot` – comprehensive transport telemetry for debugging reconnect
  behaviour.
- `pendingActionsCount`, `lastActionAt`, `lastCommandError` – façade-level instrumentation used
  to show optimistic UI states and error feedback.

Each selector is typed as a `ComputedRef` or `ReadonlyRef` that wraps `freezeDeep`-produced
snapshots. Mutating the returned structures throws at runtime, preserving store integrity.

## Command methods

Consumers mutate orchestrator state exclusively through façade commands. The implementation
logs start/success/error events and updates the telemetry selectors listed above:

- `ensureInitialized(options?)` – acquire the shared orchestrator instance via the manager store,
  bootstrapping transport connections on first use.
- `cancelJob(jobId)` – cancel an active job through the transport adapter and refresh queue
  state.
- `removeJob(jobId)` / `removeJobLocal(jobId)` – drop jobs from the queue cache after
  completion or local clean-up.
- `clearCompletedJobs()` – prune completed entries without touching running jobs.
- `refreshHistory(options?)` – reload recent results, optionally surfacing success notifications.
- `setHistoryLimit(limit)` – update the retained result count and trigger a history refresh.
- `reconnect()` – force a transport reconnection handshake.
- `releaseIfLastConsumer()` – release the orchestrator when the final consumer unmounts so
  transport watchers tear down cleanly.

## Lifecycle guarantees

The façade acquires access to the orchestrator through `useGenerationOrchestratorManagerStore`,
which tracks active consumers and orchestrates initialization/cleanup. Tests and downstream
features must never instantiate the orchestrator store directly—doing so bypasses the shared
transport binding and reintroduces the duplicate polling issues the refactor eliminated.

When extending the façade, add new selectors or commands to `facade.ts` rather than exporting
additional helpers from the Pinia stores. This keeps the public surface narrow while allowing
the underlying modules (`queueModule`, `resultsModule`, `systemStatusModule`, `transportModule`)
to evolve without breaking consumers.
