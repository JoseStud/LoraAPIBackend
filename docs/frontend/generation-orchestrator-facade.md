# Generation Orchestrator Façade Contract

`useGenerationOrchestratorFacade()` (`app/frontend/src/features/generation/orchestrator/facade.ts`)
is a read-only view of the generation orchestrator store. It returns frozen snapshots of the
queue, results and system status plus the transport state. It has no lifecycle and no commands:
reading it registers no consumer and starts no polling or WebSocket.

```ts
import { useGenerationOrchestratorFacade } from '@/features/generation/orchestrator';
import type { GenerationOrchestratorFacade } from '@/features/generation/orchestrator';
```

`@/features/generation/orchestrator` is a path alias (Vite, Vitest and `tsconfig.json`) for
`orchestrator/facade.ts`. Code outside the feature imports `useGenerationOrchestratorFacade`
from `@/features/generation/public`.

## Selectors

- `queue`, `jobs`, `activeJobs`, `sortedActiveJobs`, `hasActiveJobs` – the job queue.
- `results`, `recentResults`, `historyLimit` – recent results, capped by the history limit.
- `systemStatus`, `systemStatusReady`, `systemStatusLastUpdated`, `systemStatusApiAvailable`,
  `queueManagerActive` – backend availability.
- `isActive`, `isConnected`, `pollIntervalMs` – whether the orchestrator is running and how often
  it polls.
- `transportMetrics`, `transportPhase`, `transportReconnectAttempt`,
  `transportConsecutiveFailures`, `transportNextRetryDelayMs`, `transportLastConnectedAt`,
  `transportLastDisconnectedAt`, `transportDowntimeMs`, `transportTotalDowntimeMs`,
  `transportPaused`, `transportPauseReasons`, `transportPauseSince`,
  `transportLastPauseEvent`, `transportLastResumeEvent`, `lastError`, `lastSnapshot` – transport
  telemetry.

Arrays and objects are `freezeDeep` snapshots typed `DeepReadonly`; mutating them throws in every
build (`facade.readonly.test-d.ts` pins the types).

## Running the orchestrator and sending commands

There is one lifecycle API: `useGenerationOrchestratorManager().acquire(...)`. A binding keeps the
shared orchestrator alive until it is released, and carries every command (`initialize`,
`startGeneration`, `cancelJob`, `removeJob`, `clearCompletedJobs`, `clearQueue`, `deleteResult`,
`refreshResults`, `setHistoryLimit`, ...). The manager store
(`stores/orchestratorManagerStore.ts`) destroys the orchestrator when the last binding is
released, from whichever call site.

- The Studio acquires its binding in `useGenerationStudioController`.
- Dashboard widgets call `useGenerationWidgetBinding(label)`
  (`composables/useGenerationWidgetBinding.ts`), which acquires on mount with
  `autoSync: false` (the widget does not drive the history limit or the backend URL), logs
  orchestrator notifications to the console instead of toasting them, and releases on unmount.
- Command call sites that are not mounted for long, such as `useJobQueueActions`, acquire a
  binding for their effect scope and release it when the scope stops.

Never instantiate the orchestrator store or call its lifecycle methods directly; that bypasses
consumer counting and brings back duplicate polling.
