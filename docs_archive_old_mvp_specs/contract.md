API contract — LoRA Manager Backend (MVP)

Overview

This document defines the core HTTP endpoints and the operational responsibilities of the backend service for the LoRA Manager described in `docs/architecture.md`.
It is intended to be implementation-facing so a developer can scaffold a FastAPI server, add storage and worker integrations, and implement delivery adapters.

Primary responsibilities the backend will manage

- Adapter metadata lifecycle (create, read, update, delete).
- File registration and verification for LoRA files stored on a mounted LoRA directory (or object storage).
- Activation state and ordered lists of active adapters used for prompt composition.
- Prompt composition (token formatting, prefix/suffix injection, ordering rules).
- Delivery orchestration (HTTP to runtimes like ComfyUI, CLI runs like `sd-next`, and optional enhancers such as KoboldCpp).
- Background jobs: classification, validation, conversion, and asynchronous deliveries.
- Persistence: metadata DB (SQLite/Postgres) and pluggable file/object storage adapter (local FS / S3 / MinIO).
- Observability hooks: structured logs, delivery/job events, basic metrics (counts, latencies, failures).

Models

Adapter (primary resource)
- id: string (uuid)
- name: string (unique per adapter name + namespace)
- version: string
- tags: [string]
- file_path: string (path or storage key pointing to the LoRA file)
- weight: float (default 1.0)
- active: boolean
- ordinal: integer (optional ordering weight for compose order)
- archetype: string | null
- archetype_confidence: float | null
- created_at: timestamp
- updated_at: timestamp

DeliveryJob (async delivery record)
- id: string (uuid)
- prompt: string
- mode: string (http|cli)
- params: object (mode-specific, e.g. http host/port/path or cli template)
- status: enum (pending, running, succeeded, failed)
- result: object | null (runtime response, CLI exit code, errors)
- created_at, started_at, finished_at

Requirements for storage and validation

- `file_path` should be validated at creation/registration time: file exists and is readable when using local FS or the object exists in the configured bucket when using object storage.
- Validate LoRA file extensions/headers optionally during an importer step; the API may accept registrations first and validate asynchronously.
- Store only metadata in DB; avoid storing large binary blobs in the DB.

Requests and responses (expanded)

POST /adapters
- Purpose: register a LoRA adapter record. This is a metadata registration; binary upload may be handled by a separate upload endpoint or via pre-signed URL for object stores.
- Body (application/json):
	{ "name": str, "version": str?, "tags"?: [str], "file_path": str, "weight"?: float, "active"?: bool }
- Response: 201 { adapter }
- Validation: return 400 if name missing or file_path invalid (optionally 202 accepted if validation is deferred).

GET /adapters
- Purpose: list adapters
- Query params: `active` (optional boolean), `tag` (optional string), `limit`, `offset`, `order_by` (for pagination)
- Response: 200 { items: [adapter], total: int, limit, offset }

GET /adapters/{id}
- Purpose: fetch adapter by id
- Response: 200 { adapter } or 404

PATCH /adapters/{id}
- Purpose: modify metadata (tags, weight, version, archetype corrections)
- Body: partial adapter fields
- Response: 200 { adapter }

DELETE /adapters/{id}
- Purpose: remove metadata entry. Consider a soft-delete for safety.
- Response: 204

POST /adapters/{id}/activate
- Purpose: mark adapter active (idempotent). Optionally accept an `ordinal` to influence compose order.
- Response: 200 { adapter }

POST /adapters/{id}/deactivate
- Purpose: mark adapter inactive
- Response: 200 { adapter }

POST /compose
- Purpose: compose a prompt from active adapters and optionally trigger delivery.
- Body: { prefix?: string, suffix?: string, delivery?: { mode: "http" | "cli", http?: { host, port, path }, cli?: { template } } }
- Behaviour: by default composition uses active adapters ordered by `ordinal` then `name`. The composer produces token list and full prompt string.
- Response: 200 { prompt: string, tokens: [string], delivery?: { id?, status } }

POST /deliveries
- Purpose: enqueue an asynchronous delivery job (explicit deliveries or created by `/compose` when delivery requested).
- Body: { prompt: string, mode: string, params: object }
- Response: 201 { delivery_id }

GET /deliveries/{id}
- Purpose: query job status and result
- Response: 200 { delivery job }

Worker and background tasks

- Heavy or slow tasks (classification, file validation, format conversion, ML-based archetype refinement, and deliveries that call external runtimes) should be enqueued to a worker queue.
- Recommended pattern: a simple job table (DeliveryJob) and a queue (Redis + RQ / Celery) for MVP. The API server enqueues and returns job id immediately.
- Workers must update job status and write structured events for observability.

Prompt composition rules and token formatting

- Token format configurable per deployment. Default: `<lora:{name}:{weight}>` where `weight` is formatted with up to 3 decimal digits.
- Ordering: use explicit `ordinal` if present; otherwise sort active adapters by `name` (stable deterministic order).
- Deduplication: if multiple registrations reference identical file content and the same name, deduplicate tokens by name and keep highest weight or configurable merge rule.

Delivery adapters (pluggable)

- HTTP adapter: POST JSON to `{host}:{port}{path}` with body { prompt, metadata }. Handle timeouts and return runtime JSON.
- CLI adapter: write prompt to a temporary file and invoke CLI using exec-style APIs (avoid shell interpolation). Return CLI exit code, stdout, stderr in result.
- Extensibility: add adapter interface so new runtimes (KoboldCpp, SD-Next, ComfyUI variants) can be plugged in.

Error handling and conventions

- Use consistent error responses (RFC 7807 / Problem Details recommended). Example: 400 returns { type, title, detail, invalid_params? }.
- Retry semantics: deliveries should support a retry count with exponential backoff for transient network errors.
- Validation errors return field-level messages.

Security and operational concerns

- MVP: no auth, but design handlers to accept an Authorization header and perform no-ops if not configured.
- Rate limiting: implement simple rate limits for compose/deliver endpoints to avoid accidental overload on runtimes.
- Input sanitization: never shell-escape user text; use safe exec APIs and `--prompt-file` to avoid injection.

Observability and metrics

- Log important events with structured JSON: adapter.created, adapter.activated, compose.request, delivery.enqueued, delivery.started, delivery.completed, delivery.failed.
- Emit basic metrics: adapters.count, adapters.active_count, deliveries.enqueued, deliveries.failed, deliveries.latency_seconds.
- Instrument endpoints with latencies and error rates.

Testing and quality gates

- Unit tests for prompt composition (happy path + ordering + deduplication + formatting edge cases).
- Integration tests that mock delivery adapters to verify successful job lifecycle updates.
- Linting and type checks (mypy/flake8) for maintainability.

Migration and scalability notes

- Start with SQLite + local FS for fastest iteration. Ensure storage adapter abstraction exists so you can switch to Postgres + S3/MinIO later.
- When moving to Postgres, add migrations (Alembic) and keep DB schema backward-compatible for rolling upgrades.
- For high throughput, separate API from worker processes; use message broker + Redis and scale workers horizontally while controlling GPU queue concurrency.

Example JSON schemas (concise)

Adapter (response):
{
	"id": "uuid",
	"name": "name",
	"version": "0.1",
	"tags": ["anime"],
	"file_path": "/mnt/loras/foo.safetensors",
	"weight": 0.75,
	"active": true,
	"ordinal": 10,
	"archetype": "tsundere",
	"archetype_confidence": 0.87
}

Compose response:
{
	"prompt": "masterprompt <lora:foo:0.75> <lora:bar:0.5>",
	"tokens": ["<lora:foo:0.75>", "<lora:bar:0.5>"],
	"delivery": { "id": "uuid", "status": "queued" }
}

Requirements coverage

- Metadata CRUD, activation, and composition: covered above.
- File validation and storage abstraction: described in Storage and Validation section.
- Delivery modes (http and cli): pluggable adapters described above.
- Background worker model: described with DeliveryJob and recommended queue pattern.

Operational next steps

1. Create `backend/` scaffold with FastAPI, SQLModel, and storage adapter interface.
2. Implement `prompt_composer` and unit tests.
3. Implement adapter registration endpoints and GET/list endpoints.
4. Implement a simple in-process worker or RQ-backed worker that can process `POST /deliveries` jobs.

Notes

- This document focuses on backend responsibilities only; UI and runtime-specific node graph parsing remain separate components.
- If you want, I can scaffold the FastAPI `backend/` files next (models, composer, endpoints, deliveries) and run tests locally.
