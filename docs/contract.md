API contract — LoRA Manager Backend (current status)
===================================================

## Overview

The LoRA Manager backend is a FastAPI application that exposes REST and WebSocket
interfaces for managing adapter metadata, composing prompts, scheduling
deliveries, and interacting with an SDNext image-generation server. The code
lives in `backend/api/v1` with business logic implemented under
`backend/services`. The implementation is still a work in progress: most
endpoints exist, but several flows depend on external services, optional
dependencies, or follow-up work before they can be considered production ready.
Use this document as a guide to what is actually implemented today when wiring
up clients or planning future work.

## Implementation summary

| Area | Status | Notes |
| --- | --- | --- |
| Adapter metadata lifecycle | Implemented | CRUD, bulk actions, tag aggregation, and search live in `backend/api/v1/adapters.py` backed by the `Adapter` SQLModel.【F:backend/api/v1/adapters.py†L1-L187】【F:backend/models/adapters.py†L9-L43】 |
| Prompt composition | Implemented | `POST /v1/compose` composes tokens from active adapters and can enqueue deliveries via the delivery service.【F:backend/api/v1/compose.py†L1-L45】 |
| Delivery orchestration | Implemented (queue required) | Deliveries persist to the `DeliveryJob` table and can run through Redis/RQ or a background-task fallback.【F:backend/api/v1/deliveries.py†L1-L43】【F:backend/services/deliveries.py†L16-L205】【F:backend/services/queue.py†L1-L91】 |
| SDNext generation | Implemented, SDNext required | Generation endpoints wrap the `sdnext` backend; only txt2img-style flows are currently wired and require an SDNext server configured via settings.【F:backend/api/v1/generation.py†L1-L274】【F:backend/delivery/sdnext.py†L1-L205】 |
| Recommendations | Experimental | Recommendation APIs call into the service layer, which expects embedding models and GPU/torch dependencies to be available; missing data produces runtime errors.【F:backend/api/v1/recommendations.py†L1-L119】【F:backend/services/recommendations/service.py†L1-L153】 |
| Dashboard & system status | Implemented | Dashboard endpoints aggregate adapter statistics and delivery activity; `/system/status` exposes queue and hardware telemetry.【F:backend/api/v1/dashboard.py†L1-L40】【F:backend/api/v1/system.py†L1-L16】 |
| Import/export utilities | Partially implemented | Archive endpoints stream ZIP files and ingest uploads, but backup history uses mock data and long-running flows rely on future work in `ArchiveService`.【F:backend/api/v1/import_export.py†L1-L170】 |
| WebSocket progress | Implemented | `/ws/progress` hands connections to the `WebSocketService` which relays delivery/generation updates.【F:backend/api/v1/websocket.py†L1-L43】 |
| Storage abstraction | Local filesystem only | The storage service validates paths on disk; cloud-storage integrations are not supported and the local backend is the only option. |

## Known limitations and TODOs

* No authentication is enforced by default; API-key support exists in settings
  but is not wired into the router modules yet.
* Delivery queue processing depends on either a running Redis instance or the
  in-process background-task fallback; there is no dedicated worker supervisor.
* Recommendation endpoints require optional ML dependencies and precomputed
  embeddings; they will raise runtime errors when models or data are missing.
* Import/export helpers stream data from disk; cloud storage backends are not
  implemented and error handling is minimal.
* Generated image storage assumes local disk access and does not publish URLs.

## Endpoint reference

### Adapter management (`/v1/adapters`)

* `POST /v1/adapters` – create an adapter. Validates that `file_path` exists
  using the storage service and rejects duplicate name/version combinations.【F:backend/api/v1/adapters.py†L7-L32】
* `GET /v1/adapters` – list adapters with optional text search, activity
  filtering, tag filtering, pagination, and sorting.【F:backend/api/v1/adapters.py†L34-L69】
* `GET /v1/adapters/{id}` – fetch a single adapter record.【F:backend/api/v1/adapters.py†L118-L133】
* `PATCH /v1/adapters/{id}` – update safe fields such as weight, tags, or
  activation flags; invalid payloads raise `400` or `404` as appropriate.【F:backend/api/v1/adapters.py†L86-L113】
* `DELETE /v1/adapters/{id}` – delete an adapter. Returns `404` if the adapter is
  missing.【F:backend/api/v1/adapters.py†L115-L118】
* `POST /v1/adapters/{id}/activate` / `POST /v1/adapters/{id}/deactivate` – mark
  adapters active or inactive and optionally set an ordinal for composition.【F:backend/api/v1/adapters.py†L135-L155】
* `POST /v1/adapters/bulk` – perform bulk activate/deactivate/delete operations
  within a transaction.【F:backend/api/v1/adapters.py†L71-L105】
* `GET /v1/adapters/tags` – return the distinct tag list used across adapters.【F:backend/api/v1/adapters.py†L57-L69】

### Prompt composition (`/v1/compose`)

* `POST /v1/compose` – composes the active adapter list into a `<lora:name:weight>`
  prompt string. When the optional `delivery` block is provided it will create a
  delivery job via the delivery service and return the queued job id and status.【F:backend/api/v1/compose.py†L1-L45】

### Delivery management (`/v1/deliveries`)

* `POST /v1/deliveries` – create a delivery job for the given prompt/mode and
  enqueue it using the configured queue backend (Redis if available, otherwise
  FastAPI background tasks).【F:backend/api/v1/deliveries.py†L1-L26】【F:backend/services/queue.py†L49-L91】
* `GET /v1/deliveries/{id}` – return persisted job parameters, timestamps, and
  any serialized result payload.【F:backend/api/v1/deliveries.py†L28-L43】

### Generation (`/v1/generation`)

* `GET /v1/generation/backends` – report which generation backends are registered
  and available via the delivery registry.【F:backend/api/v1/generation.py†L47-L54】
* `POST /v1/generation/generate` – run an immediate generation request through
  the configured backend (defaults to `sdnext`). Validation emits warnings but
  does not block execution.【F:backend/api/v1/generation.py†L56-L111】
* `GET /v1/generation/progress/{job_id}` – poll backend-specific job progress
  (primarily for deferred SDNext jobs).【F:backend/api/v1/generation.py†L113-L128】
* `POST /v1/generation/compose-and-generate` – combine prompt composition with a
  generation call; fails with `400` when no active adapters are available.【F:backend/api/v1/generation.py†L130-L176】
* `POST /v1/generation/queue-generation` – schedule generation work as a
  delivery job and start WebSocket monitoring.【F:backend/api/v1/generation.py†L178-L223】
* `GET /v1/generation/jobs/active` – return normalized telemetry for jobs in
  `pending` or `running` states to feed frontend queues.【F:backend/api/v1/generation.py†L225-L275】
* `GET /v1/generation/jobs/{job_id}` – fetch a single job record packaged as a
  delivery wrapper.【F:backend/api/v1/generation.py†L277-L300】
* `POST /v1/generation/jobs/{job_id}/cancel` – mark a cancellable job as
  cancelled and stop websocket monitoring.【F:backend/api/v1/generation.py†L302-L322】
* `GET /v1/generation/results` – list recently completed jobs with selected
  metadata and image references (base64 strings or file paths).【F:backend/api/v1/generation.py†L324-L373】

### Recommendations (`/v1/recommendations`)

* `GET /v1/recommendations/similar/{lora_id}` – request similar LoRAs using the
  recommendation engine. Requires embeddings and heavy dependencies to be
  available.【F:backend/api/v1/recommendations.py†L1-L57】
* `POST /v1/recommendations/for-prompt` – suggest LoRAs that match a prompt and
  optional preferences.【F:backend/api/v1/recommendations.py†L59-L96】
* `GET /v1/recommendations/stats` – return aggregate recommendation metrics from
  the service.【F:backend/api/v1/recommendations.py†L98-L109】
* `POST /v1/recommendations/embeddings/compute` – kick off embedding computation
  for one or many adapters; depends on the embedding manager implementation.【F:backend/api/v1/recommendations.py†L111-L139】
* `GET /v1/recommendations/embeddings/{lora_id}` – inspect embedding status for a
  single adapter.【F:backend/api/v1/recommendations.py†L141-L151】
* Additional feedback and preference endpoints are defined in the same module
  and expect future service implementations to persist data.【F:backend/api/v1/recommendations.py†L153-L198】

### Dashboard (`/v1/dashboard`)

* `GET /v1/dashboard/stats` – combine adapter statistics, queue activity counts,
  and system health summary data for the dashboard view.【F:backend/api/v1/dashboard.py†L1-L23】
* `GET /v1/dashboard/featured-loras` – list curated adapters using the adapter
  service’s featured query.【F:backend/api/v1/dashboard.py†L25-L37】
* `GET /v1/dashboard/activity-feed` – expose recent delivery job activity.【F:backend/api/v1/dashboard.py†L39-L40】

### Import/export (`/v1/import-export`)

* `POST /v1/import-export/export/estimate` – returns estimated archive size and
  duration using adapter statistics; if LoRA export is disabled, returns zeros.【F:backend/api/v1/import_export.py†L1-L64】
* `POST /v1/import-export/export` – streams a ZIP archive built from adapters via
  the archive service; rejects unsupported formats.【F:backend/api/v1/import_export.py†L66-L98】
* `POST /v1/import-export/import` – validate and import uploaded archives into
  the local filesystem. Errors are reported per file, and the import path defaults
  to `settings.IMPORT_PATH` or `./loras`.【F:backend/api/v1/import_export.py†L100-L170】
* `GET /v1/import-export/backups/history` & `POST /v1/import-export/backup/create`
  – placeholder backup endpoints that currently return mock data or simple
  success payloads pending a full backup workflow.【F:backend/api/v1/import_export.py†L172-L209】

### System status (`/v1/system`)

* `GET /v1/system/status` – combine GPU detection, queue statistics, and disk
  usage into a telemetry snapshot for clients.【F:backend/api/v1/system.py†L1-L16】【F:backend/services/system.py†L1-L149】

### WebSocket progress (`/v1/ws/progress` or `/api/v1/ws/progress`)

* `GET /v1/ws/progress` (WebSocket) – subscribe to progress events for delivery
  and generation jobs. Clients send subscription messages after connecting, and
  the `WebSocketService` manages broadcasts.【F:backend/api/v1/websocket.py†L1-L43】

---

This contract is intentionally conservative. When adding new endpoints or
extending existing ones, update this document so it reflects the repository’s
actual behaviour.
