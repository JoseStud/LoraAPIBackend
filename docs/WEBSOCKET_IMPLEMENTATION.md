# WebSocket Implementation Guide

This document details the WebSocket implementation for real-time progress monitoring of image generation jobs.

## 1. Overview

The WebSocket implementation provides a way for clients to receive live updates about long-running tasks, such as image generation. It is built on FastAPI's WebSocket support and uses a subscription-based model to deliver targeted messages.

**Key Features**:
-   **Real-Time Progress**: Clients get live progress updates (0-100%) for generation jobs.
-   **Subscription Model**: Clients can subscribe to updates for specific job IDs or all jobs.
-   **Event-Driven**: The system sends structured messages for events like `generation_started`, `progress_update`, and `generation_complete`.
-   **Decoupled**: The WebSocket logic is handled in a separate service, decoupled from the main API endpoints.

---

## 2. Architecture

The implementation consists of three main components:

1.  **`ConnectionManager` (`backend/services/websocket.py`)**:
    -   Manages all active WebSocket connections.
    -   Handles client subscriptions to specific job IDs.
    -   Broadcasts messages to relevant subscribed clients.

2.  **`WebSocketService` (`backend/services/websocket.py`)**:
    -   The core service that orchestrates WebSocket functionality.
    -   Starts and stops background tasks to poll for job progress from the SD.Next API.
    -   Handles incoming client messages (e.g., subscription requests).

3.  **WebSocket Endpoint (`backend/api/v1/websocket.py`)**:
    -   Exposes the `/api/ws/progress` endpoint.
    -   Accepts new client connections and passes them to the `WebSocketService`.

### Message Flow

1.  A client connects to the `ws://<host>/api/ws/progress` endpoint.
2.  The client sends a `subscribe` message, specifying which job IDs to monitor (or `null` for all jobs).
    ```json
    {
      "type": "subscribe",
      "job_ids": ["job-123"]
    }
    ```
3.  When an image generation job is started via an API call, the `GenerationService` notifies the `WebSocketService`.
4.  The `WebSocketService` starts a background task that polls the SD.Next `/sdapi/v1/progress` endpoint.
5.  As progress updates are received, the service broadcasts `progress_update` messages to all subscribed clients.
6.  When the job is complete, a `generation_complete` message is sent, and the polling task is stopped.

---

## 3. How to Use

### Client-Side Implementation

Clients need to connect to the WebSocket and handle incoming messages.

```javascript
// Example client-side JavaScript
const ws = new WebSocket('ws://localhost:8000/api/ws/progress');

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
1. Client connects to `/ws/progress`
2. Client sends subscription request
3. Server confirms subscription
4. When generation job starts → `generation_started` message
5. Server polls SDNext progress → `progress_update` messages
6. When job completes → `generation_complete` message

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

## 🚀 Production Ready!

The WebSocket progress monitoring implementation is:
- ✅ Fully functional with comprehensive test coverage
- ✅ Integrated with existing architecture and backward compatible  
- ✅ Production-ready with proper error handling and cleanup
- ✅ Well-documented with test clients and examples

This completes **Phase 2 Advanced Features** milestone for WebSocket progress monitoring!
