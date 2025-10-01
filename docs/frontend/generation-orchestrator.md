# Generation Orchestrator Façade Contract

## Overview
The generation orchestrator store (`useGenerationOrchestratorStore`) is the thin façade that
coordinates queue polling, transport interactions, and result hydration for the studio. The store
is intentionally lightweight (~200 LOC) and delegates work to specialised queue, results, system
status, and transport modules. A single instance should be shared across the UI via
`useGenerationOrchestratorManager()`.

## Reactive State (Read-Only Snapshots)
All reactive state is exposed as immutable snapshots. Consumers receive frozen arrays/objects so
attempts to mutate them throw, preventing accidental corruption of internal state.

| State Key | Description |
| --- | --- |
| `jobs` | Raw queue contents sorted by insertion order; read-only clone of the internal queue. |
| `activeJobs` | Jobs currently processing or queued. |
| `sortedActiveJobs` | Active jobs sorted by status/creation time for UI display. |
| `recentResults` | Recent generation results trimmed to the active history limit. |
| `systemStatus` | Latest system status payload including connectivity flags. |
| `isConnected` | Boolean ref that tracks transport connectivity. |
| `queueManagerActive` | Flag indicating the orchestrator has initialised transport. |
| `historyLimit`, `pollIntervalMs`, `systemStatusReady`, `systemStatusLastUpdated`, `systemStatusApiAvailable` | Derived settings surfaced from the underlying modules. |
| `isActive` | Read-only flag showing whether transport is active. |

> **Contract:** Reading any of the above does **not** trigger network calls, watchers, or mutations.
All updates flow through explicit actions listed below.

## Lifecycle Methods
- `initialize(options)` – Configures transport, hydrates initial state, and wires callbacks. Must be
  invoked exactly once per lifecycle via the orchestrator manager.
- `cleanup()` – Tears down transport subscriptions but preserves cached data.
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

## Behavioural Guarantees
- **Read operations are side-effect free.** Accessing refs or calling getters never instantiates
  transports or watchers.
- **Single source of truth.** The store should only be accessed through
  `useGenerationOrchestratorManager()` so that the manager can enforce a singleton instance and
  orchestrate lifecycle transitions.
- **No unsolicited watchers.** The façade does not start watchers; external consumers are responsible
  for establishing reactive effects (handled today by the orchestrator manager composable).

Following these guarantees keeps the orchestrator façade predictable, testable, and ready for future
expansion without leaking implementation details to the UI layer.
