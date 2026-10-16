# WebSocket Implementation Guide

This document details the WebSocket implementation for real-time progress monitoring of image generation jobs.

## 1. Overview

The WebSocket implementation provides a way for clients to receive live updates about long-running tasks, such as image generation. It is built on FastAPI's WebSocket support and uses a subscription-based model to deliver targeted messages.

**Key Features**:
-   **Real-Time Progress**: Clients get live progress updates for generation jobs, as a fraction from 0 to 1 (1 is complete).
-   **Subscription Model**: Clients can subscribe to updates for specific job IDs or all jobs.
-   **Event-Driven**: The system sends structured messages for events like `generation_started`, `progress_update`, and `generation_complete`.
-   **Decoupled**: Messages are produced from persisted job state by one background loop; API handlers and job runners never broadcast them.

---

## 2. Architecture

The implementation consists of four main components:

1.  **`ConnectionManager` (`backend/services/websocket/connection_manager.py`)**:
    -   Manages all active WebSocket connections.
    -   Handles client subscriptions to specific job IDs.
    -   Broadcasts messages to relevant subscribed clients, and reports
        whether anyone is subscribed (`has_subscribers()`).

2.  **`WebSocketService` (`backend/services/websocket/service.py`)**:
    -   A module-global instance that owns the `ConnectionManager`.
    -   Handles incoming client messages (e.g., subscription requests).

3.  **`JobProgressMonitor` (`backend/services/websocket/job_monitor.py`)**:
    -   One loop, started and stopped by the FastAPI lifespan (like
        `JobRecovery`), that turns persisted delivery job state into
        `generation_started`, `progress_update` and `generation_complete`
        messages. It reads jobs through `DeliveryJobStateRepository`
        (`persistence.py`).

4.  **WebSocket Endpoint (`backend/api/v1/websocket.py`)**:
    -   Exposes the canonical `/api/v1/ws/progress` endpoint (via the main app's `/api` mount).
    -   Accepts new client connections and passes them to the `WebSocketService`.

### Message Flow

1.  A client connects to the `ws://<host>/api/v1/ws/progress` endpoint (or `ws://<host>/v1/ws/progress` when bypassing the `/api` mount).
2.  The client sends a `subscribe` message, specifying which job IDs to monitor (or `null` for all jobs).
    ```json
    {
      "type": "subscribe",
      "job_ids": ["job-123"]
    }
    ```
3.  Every `SDNEXT_POLL_INTERVAL` seconds (default 2) the monitor ticks. With
    no subscribed connection the tick does nothing: no database query and no
    SD.Next call. Otherwise it loads, in one query in a worker thread, the
    active jobs (`pending`/`retrying`/`running`), the jobs that finished since
    the previous tick and the jobs it is tracking.
4.  When it first sees a job `running` (a runner claimed it, from the API's
    in-process runner or an RQ worker), it sends `generation_started` with the
    job's stored generation parameters.
5.  It sends `progress_update` for every active job. SD.Next's
    `/sdapi/v1/progress` is process-global, so it is polled once per tick and
    only for the `running` job; queued jobs report their stored progress or 0.
6.  When a job leaves the active set as `succeeded` or `failed`, it sends a
    final `progress_update` and `generation_complete`, built from the stored
    row. A job that ran entirely between two ticks still gets
    `generation_started` (if claimed), progress and completion.

**Cancelled jobs** get no `generation_complete`: the monitor drops them
silently. The client that cancelled a job removes it itself, and the SPA
treats any `generation_complete` whose status is not `completed` as a
failure. Other clients see the job leave `GET /v1/generation/jobs/active`.

**Restarts**: the first tick after startup (or after a time with no
subscribers) seeds the tracking from the active jobs only. Jobs already
running get progress and completion; jobs that finished before that tick are
not announced.

---

## 3. How to Use

### Client-Side Implementation

Clients need to connect to the WebSocket and handle incoming messages.

```javascript
// Example client-side JavaScript
const ws = new WebSocket('ws://localhost:8000/api/v1/ws/progress');

ws.onopen = () => {
    console.log('WebSocket connected!');
    // Subscribe to all job updates
    ws.send(JSON.stringify({ type: 'subscribe', job_ids: null }));
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === 'progress_update') {
        const { job_id, progress, status } = message.data;
        console.log(`Job ${job_id} is ${status} at ${progress * 100}%`);
        // Update your UI progress bar here
    } else if (message.type === 'generation_complete') {
        console.log('Generation finished!', message.data);
    }
};

ws.onclose = () => {
    console.log('WebSocket disconnected.');
};
```

### Testing the Implementation

The project includes two test clients in the `examples/` directory:

1.  **`websocket_test_client.html`**: An interactive HTML page for connecting to the WebSocket, sending test generation requests, and viewing live progress updates and logs. This is the easiest way to test the full functionality.
2.  **`websocket_client_example.py`**: A Python script that demonstrates the full workflow programmatically.

**To test:**
1.  Open `examples/websocket_test_client.html` in your browser.
2.  Click "Connect".
3.  Use the provided `curl` command to start a generation job.
4.  Observe the real-time progress updates in the browser.

---

## 4. Schemas

The following Pydantic schemas are used for WebSocket communication (`backend/schemas/websocket.py`):

-   `WebSocketMessage`: A base model for all messages, containing `type` and `timestamp`.
-   `ProgressUpdate`: Contains job progress details (`job_id`, `progress`, `status`).
-   `GenerationStarted`: Notifies clients that a job has begun.
-   `GenerationComplete`: Provides the final result of a job.
-   `WebSocketSubscription`: The format for client subscription requests.


#### Message Flow
1. Client connects to `/api/v1/ws/progress` (or `/v1/ws/progress` when addressing the backend service directly)
2. Client sends subscription request
3. Server confirms subscription
4. When a runner claims a job → `generation_started` message
5. Every monitor tick → `progress_update` messages for active jobs
6. When the job succeeds or fails → `generation_complete` message (none for
   a cancelled job)

#### Architecture Benefits
- **Non-blocking**: WebSocket monitoring doesn't interfere with API performance
- **Scalable**: Subscription-based routing minimizes unnecessary traffic
- **Extensible**: Easy to add new message types and features
- **Testable**: Comprehensive test clients for development and debugging

### What's Next (Future Phase 2 Features)

- **ControlNet Integration**: Advanced image composition controls
- **Image Previews**: Real-time preview images during generation
- **Batch Operations**: Multi-job queue management via WebSocket
- **Performance Metrics**: Real-time generation statistics and monitoring

## Current status

The progress WebSocket works with the existing queue pipeline, but it should
still be considered experimental until the surrounding delivery
infrastructure is hardened.

- ✅ Endpoint wiring is complete: `/v1/ws/progress` (and `/api/v1/ws/progress`
  via the main app) delegate to the shared `WebSocketService`, which subscribes
  to delivery and generation updates.【F:backend/api/v1/websocket.py†L1-L43】
- ✅ One lifespan-owned `JobProgressMonitor` broadcasts structured events as
  persisted jobs change state, whichever process runs them
  (`backend/services/websocket/job_monitor.py`, tested by
  `tests/test_job_monitor.py`).
- ⚠️ Load and failure-mode testing is limited; queue backpressure and
  disconnect handling still need real-world validation alongside the delivery
  worker.【F:backend/services/deliveries.py†L16-L205】
- ⚠️ The HTML and Python test clients are useful for manual checks, but an
  automated end-to-end suite that exercises the socket alongside SDNext is still
  on the wishlist.【F:tests/test_generation_jobs.py†L1-L200】
