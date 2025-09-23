# API contract – current implementation

This document describes the API that ships with the repository today. The
backend is a FastAPI application mounted at `/api/v1` (or `/v1` when the backend
service runs without the wrapper in `app/main.py`). Routes are implemented under
`backend/api/v1`, with service logic living in the `backend/services` package.

## Implementation summary

| Area | Status | Notes |
| --- | --- | --- |
| Adapter metadata lifecycle | Implemented | CRUD, search, tagging, activation, and bulk actions backed by `AdapterService`. |
| Prompt composition | Implemented | Generates prompt strings from active adapters and can optionally enqueue deliveries. |
| Delivery orchestration | Implemented (config required) | Supports SDNext generation jobs with optional Redis queueing and WebSocket progress notifications. |
| AI recommendations | Partially implemented | Similar-LoRA and prompt-based endpoints are available but depend on optional ML models and embeddings. |
| Analytics & dashboard data | Implemented | Aggregated KPIs, charts, and insights built from delivery history. |
| Import/export & backups | Implemented | Estimate, stream, and ingest archives plus create/delete backup entries. |
| System status | Implemented | Exposes health metrics, queue state, and environment information. |
| WebSocket progress | Implemented | `/ws/progress` broadcasts job updates to subscribed clients. |

## External dependencies

- **Database** – Defaults to SQLite; configure `DATABASE_URL` for other engines.
- **Redis** – Optional primary queue backend. When absent the orchestrator falls
  back to FastAPI background tasks.
- **SDNext** – Required for real image generation. Without it the generation
  endpoints return validation payloads or failed status objects.
- **Recommendation ML stack** – Optional packages listed in
  `requirements-ml.txt` enable embeddings and similarity calculations.

## Endpoint reference

### Adapter management (`/v1/adapters`)

- `POST /v1/adapters` – Create an adapter after validating the file path and
  enforcing name/version uniqueness (see `backend/api/v1/adapters.py`).
- `GET /v1/adapters` – Search, filter, and paginate adapters.
- `GET /v1/adapters/{id}` – Fetch a single adapter record.
- `PATCH /v1/adapters/{id}` – Update safe fields such as tags, weight, and
  activation flags.
- `DELETE /v1/adapters/{id}` – Remove an adapter.
- `POST /v1/adapters/{id}/activate` / `POST /v1/adapters/{id}/deactivate` –
  Toggle adapter activity and ordinals.
- `POST /v1/adapters/bulk` – Bulk activate, deactivate, or delete adapters.
- `GET /v1/adapters/tags` – Return distinct tag values.

### Prompt composition (`/v1/compose`)

- `POST /v1/compose` – Compose active adapters into a prompt string. When a
  delivery payload is supplied the endpoint creates a queued job via
  `DeliveryService` (`backend/api/v1/compose.py`).

### Deliveries & generation (`/v1/deliveries`, `/v1/generation`)

- `POST /v1/deliveries` – Persist a delivery job and enqueue it through the
  queue orchestrator. `GET /v1/deliveries/{id}` retrieves job metadata.
- `GET /v1/generation/backends` – List registered generation backends.
- `POST /v1/generation/generate` – Run an immediate SDNext request.
- `POST /v1/generation/compose-and-generate` – Compose adapters and trigger a
  generation in one call.
- `POST /v1/generation/queue-generation` – Queue a deferred generation job and
  start WebSocket monitoring.
- `GET /v1/generation/jobs/active` – Return normalized telemetry for jobs in
  pending or running states.
- `GET /v1/generation/jobs/{job_id}` – Fetch delivery/job details wrapped for
  the frontend.
- `POST /v1/generation/jobs/{job_id}/cancel` – Cancel a queued job when the
  backend supports it.
- `GET /v1/generation/results` – List recent generation results, including image
  payloads or file paths.
- `GET /v1/generation/progress/{job_id}` – Poll SDNext progress directly.

### Recommendations (`/v1/recommendations`)

- `GET /v1/recommendations/similar/{lora_id}` – Return similar adapters using
  the embeddings index.
- `POST /v1/recommendations/for-prompt` – Suggest adapters that complement a
  prompt.
- `GET /v1/recommendations/stats` – Summarise embedding status and usage.
- `POST /v1/recommendations/embeddings/compute` – Compute embeddings for one or
  more adapters (requires ML stack).
- `GET /v1/recommendations/embeddings/{lora_id}` – Inspect the embedding status
  for an adapter.
- Additional feedback endpoints exist but expect custom persistence layers
  before they return meaningful data.

### Analytics (`/v1/analytics`)

- `GET /v1/analytics/summary` – Aggregate KPIs, error breakdown, time-series
  charts, and derived insights.
- `GET /v1/analytics/stats` – Headline KPIs such as totals, success rate, and
  active LoRA counts.
- `GET /v1/analytics/errors` – Breakdown of recent failures by message.
- `GET /v1/analytics/timeseries` – Time-series datasets for charting.
- `GET /v1/analytics/insights` – Human-readable performance observations built
  from stats and error data.

### Dashboard (`/v1/dashboard`)

- `GET /v1/dashboard/stats` – Combine adapter metrics, queue summaries, and
  system health data for the dashboard view.
- `GET /v1/dashboard/featured-loras` – Retrieve curated adapter selections.
- `GET /v1/dashboard/activity-feed` – Stream recent delivery activity.

### Import/export & backups (`/v1/export`, `/v1/import`, `/v1/backups`)

- `POST /v1/export/estimate` – Estimate archive size and duration based on
  adapter statistics.
- `POST /v1/export` – Stream a ZIP archive built with the archive planner.
- `POST /v1/import` – Validate uploaded archives and import adapters into the
  configured directory.
- `GET /v1/backups/history` – List persisted backup entries.
- `POST /v1/backup/create` – Create a new backup and return metadata.
- `DELETE /v1/backups/{backup_id}` – Remove a backup and associated archive.

### System status (`/v1/system`)

- `GET /v1/system/status` – Report health information including GPU detection,
  queue connectivity, and disk usage.

### WebSocket progress (`/v1/ws/progress` or `/api/v1/ws/progress`)

- `WebSocket /ws/progress` – Clients subscribe to generation and delivery
  progress by sending a `subscribe` message after connecting. The
  `WebSocketService` manages subscriptions and broadcasts updates from the
  generation coordinator.

---

Keep this document aligned with the codebase as new endpoints are added or
behaviour changes. The goal is to represent the running application rather than
future plans.

