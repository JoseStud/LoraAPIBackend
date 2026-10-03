# Backend walkthrough transcript

The captioned recording and exact tested commit are attached to the
[backend-demo-v1 release](https://github.com/JoseStud/LoraAPIBackend/releases/tag/backend-demo-v1).
The walkthrough demonstrates backend behavior with simulated image output.

## 0:00 — Scope

This is LoRA Manager's queued-generation feature. FastAPI, PostgreSQL, Redis and
an RQ worker run as separate containers. Only SDNext is simulated: it returns a
fixed blue PNG. No GPU or personal configuration is required.

## 0:25 — Start and inspect

Clone the repository and run `make demo`. Open `http://127.0.0.1:18000/api/docs`
and authorize with the public demo value documented in the README. The server
binds to loopback and the demo has separate volumes. The release identifies the
exact source revision used in the recording.

## 0:50 — Queue and worker

Run `make demo-check`. It checks migrations and request validation, stops the
worker, and submits a generation request. The job stays queued. Starting the
worker changes the job to processing and then completed. This proves Redis/RQ
is being used rather than the in-process fallback.

## 1:25 — Result and persistence

The check decodes the PNG, verifies its checksums and compares the saved image
bytes. It checks timestamps and simulated metadata. After an API restart, the
same delivery and history result are still readable from PostgreSQL.

## 1:50 — Controlled failures

The simulator returns HTTP 503, waits past the client timeout, returns a malformed
response, then invalid image data. Each job reaches a failed state with a safe
client message. A final successful request shows that the worker can continue.

## 2:20 — Code and tradeoffs

The route validates the request, the queue orchestrator schedules it, and the
delivery runner persists state transitions. The SDNext client contains the HTTP
boundary and image storage writes output. Separate processes keep long inference
out of the request, at the cost of more services. SQL and Redis writes are not
atomic; production delivery guarantees would need an outbox and idempotency.
Shared files and base64 responses are simple locally but do not scale well.

## 3:00 — Reproduce and limits

Use `npm run ci:check` for the full quality checks. CI also runs `make demo-check`
twice. `make demo-down` retains data; `make demo-reset` removes only demo data.
An optional SDNext URL enables real inference. This demonstration does not prove
GPU performance, multi-user authentication or worker-crash recovery.
