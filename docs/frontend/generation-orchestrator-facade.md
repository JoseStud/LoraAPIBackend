# Generation Orchestrator Facade Contract

The generation orchestrator is exposed to the rest of the application through a dedicated
TypeScript façade. The façade defines the only supported surface for reading generation state
and issuing orchestration commands prior to the upcoming refactor.

## Public import

```ts
import type { GenerationOrchestratorFacade } from '@/features/generation/orchestrator';
```

The `@/features/generation/orchestrator` path alias maps to the façade definitions and is the
only public entry-point for orchestration capabilities. Raw Pinia stores (for example
`useGenerationResultsStore`) must remain private to the feature package.

## Read-only selectors

All selectors are reactive Vue references that expose immutable snapshots:

- `queue`, `jobs`, `activeJobs`, `sortedActiveJobs`, `hasActiveJobs` – queue state, frozen per job.
- `results`, `recentResults`, `historyLimit` – history summaries constrained by the configured limit.
- `systemStatus`, `systemStatusReady`, `systemStatusLastUpdated`, `systemStatusApiAvailable`,
  `queueManagerActive` – backend availability and health snapshots.
- `isActive`, `isConnected`, `pollIntervalMs` – lifecycle markers for the orchestrator and
  transport bindings.
- `transportMetrics`, `transportPhase`, `transportReconnectAttempt`,
  `transportConsecutiveFailures`, `transportNextRetryDelayMs`, `transportLastConnectedAt`,
  `transportLastDisconnectedAt`, `transportDowntimeMs`, `transportTotalDowntimeMs` – real-time
  transport telemetry.
- `lastError`, `lastSnapshot` – the most recent transport error and websocket event snapshot.

Each selector is typed as a `ComputedRef` or `ReadonlyRef` that resolves to deeply immutable
snapshots. Attempting to assign to `facade.queue.value` or `facade.results.value` fails at
compile-time, preventing accidental mutations of orchestrator internals.

## Command methods

The façade exposes explicit methods for all write operations:

- `cancelJob(jobId)` – cancel an active job through the transport adapter.
- `removeJob(jobId)` – drop a job from the queue cache after completion or cancellation.
- `refreshHistory(options?)` – reload the recent history list, optionally surfacing success
  notifications.
- `reconnect()` – trigger a transport reconnection handshake.
- `setHistoryLimit(limit)` – update the maximum number of cached history entries.

Future implementations of the façade must satisfy this contract: no store instances leave the
module, selectors stay read-only, and every state change flows through dedicated commands.
