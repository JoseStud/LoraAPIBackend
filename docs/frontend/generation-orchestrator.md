# Generation Orchestrator Store Contract

## Overview
The generation orchestrator store (`useGenerationOrchestratorStore`) lives in
`app/frontend/src/features/generation/stores/useGenerationOrchestratorStore.ts`. It acts as a thin
façade over specialised queue, results, system-status, and transport modules, exposing immutable
state snapshots and explicit lifecycle hooks while delegating heavy lifting to helper modules.

Recent frontend architecture changes introduced a dedicated manager store that ensures the
orchestrator is instantiated exactly once and that all long-lived watchers reside outside the
store. Always acquire the orchestrator through `useGenerationOrchestratorManager()` so the shared
transport bindings and teardown logic remain intact.

## Reactive State (Read-Only Snapshots)
All reactive state is exposed as immutable snapshots via `freezeDeep`. Consumers receive frozen
arrays/objects so attempts to mutate them throw, preventing accidental corruption of internal
state.

| State Key | Description |
| --- | --- |
| `jobs`, `queue` | Raw queue contents sorted by insertion order; read-only clones of the internal queue. |
| `jobsByUiId`, `jobsByBackendId` | Maps that resolve jobs by their UI or backend identifiers. |
| `activeJobs`, `sortedActiveJobs`, `hasActiveJobs` | Active job collections and derived flags for UI display. |
| `recentResults`, `results`, `historyLimit` | Recent generation results trimmed to the active history limit. |
| `systemStatus`, `systemStatusReady`, `systemStatusLastUpdated`, `systemStatusApiAvailable` | Latest system status payload including connectivity flags. |
| `queueManagerActive` | Flag indicating the orchestrator has initialised transport. |
| `isConnected`, `isActive` | Booleans reflecting transport connectivity and active lifecycle state. |
| `pollIntervalMs` | Current polling cadence resolved from backend/runtime settings. |
| `transportMetrics`, `transportPhase`, `transportReconnectAttempt`, `transportConsecutiveFailures`, `transportNextRetryDelayMs`, `transportLastConnectedAt`, `transportLastDisconnectedAt`, `transportDowntimeMs`, `transportTotalDowntimeMs`, `transportLastError`, `transportLastSnapshot` | Immutable transport telemetry captured by the transport module. |

> **Contract:** Reading any of the above does **not** trigger network calls, watchers, or mutations.
All updates flow through explicit actions listed below.

## Lifecycle Methods
- `initialize(options)` – Configures transport, hydrates initial state, and wires callbacks. The
  manager ensures this runs once per shared lifecycle.
- `cleanup()` – Tears down transport subscriptions but preserves cached data so reconnection is
  fast.
- `destroy()` – Performs `cleanup()` and resets all internal state.
- `resetState()` – Clears queue, results, and system status modules without touching transport.

## Data Loading & Transport Actions
- `loadSystemStatusData()` – Refreshes system status through the transport adapter.
- `loadActiveJobsData()` – Refreshes queue data.
- `loadRecentResults(notifySuccess?: boolean)` – Refreshes recent results list.
- `refreshAllData()` – Refreshes status, queue, and results in a single call.
- `handleBackendUrlChange()` – Reconnects the transport and refreshes data when the backend URL
  changes.
- `startGeneration(payload)` – Enqueues a new generation request and seeds an optimistic queue entry.
- `cancelJob(jobId)` – Cancels a single job and removes it from the queue snapshot.
- `clearQueue()` – Cancels all cancellable jobs in parallel.
- `deleteResult(resultId)` – Removes a result both remotely and from the local cache.

## Queue & Result Utilities
- `enqueueJob`, `setJobs`, `updateJob`, `removeJob`, `clearCompletedJobs`, `isJobCancellable`,
  `getCancellableJobs`, `handleProgressMessage`, `handleCompletionMessage`, `handleErrorMessage`,
  `ingestQueue` – Low-level queue helpers primarily used by the transport adapter handlers.
- `setResults`, `addResult`, `removeResult`, `setHistoryLimit`, `resetResults` – Helper functions for
  managing the results cache.

## Helper Module Responsibilities

- **Queue module (`queueModule.ts`)** – Normalises incoming jobs, tracks optimistic entries, and
  exposes lookup helpers (`getJobByIdentifier`, `isJobCancellable`, `clearCompletedJobs`).
- **Results module (`resultsModule.ts`)** – Maintains the recent results cache, enforces history
  limits, and converts backend payloads into immutable result objects.
- **System status module (`systemStatusModule.ts`)** – Tracks backend connectivity, exposes
  `queueManagerActive`, and publishes polling cadence updates consumed by the transport module.
- **Transport module (`transportModule.ts`)** – Records connection snapshots, metrics, retry
  counters, and last-seen errors while storing the active transport adapter instance.
- **Adapter handlers (`adapterHandlers.ts`)** – Bridge transport callbacks into the queue/results
  modules so WebSocket and polling responses remain type-safe.

## Behavioural Guarantees

- **Read operations are side-effect free.** Accessing refs or calling getters never instantiates
  transports or watchers.
- **Single source of truth.** The orchestrator should only be acquired through
  `useGenerationOrchestratorManager()` or the façade so the manager can enforce the singleton
  lifecycle and clean up watchers when the final consumer exits.
- **No unsolicited watchers.** The store does not start watchers on its own; manager-controlled
  scopes (for example, backend URL watchers and history visibility) orchestrate side effects.

Following these guarantees keeps the orchestrator predictable, testable, and ready for future
expansion without leaking implementation details to the UI layer.
