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
  back to an in-process runner that executes jobs one at a time on its own
  thread and event loop.
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
  the frontend. Here and in `/jobs/active`, `result.images` holds
  browser-loadable sources (the result image route or a `data:` URI), never the
  stored references.
- `POST /v1/generation/jobs/{job_id}/cancel` – Cancel a pending, retrying or
  running job (400 once it has finished). Cancelling a running job also
  interrupts SDNext, whose interrupt stops whatever it is rendering; the runner
  then keeps the `cancelled` status, deletes the images it saved and sends no
  webhook.
- `GET /v1/generation/results` – List recent generation results. `image_url`
  and `thumbnail_url` are browser-loadable: the result image route for images
  saved to disk, a `data:` URI for results stored as base64 (older rows, or
  jobs queued with `save_images=false` and `return_format=base64`), or an
  `http(s)` URL; `null` when there is nothing to show.
- `POST /v1/generation/results/export` – Stream a ZIP archive containing
  selected generation results.
- `DELETE /v1/generation/results/bulk-delete` – Remove multiple generation
  results in a single request.
- `DELETE /v1/generation/results/{result_id}` – Delete an individual result and
  its associated artifacts.
- `GET /v1/generation/results/{result_id}/download` – Stream the primary asset
  for a stored result.
- `GET /v1/generation/results/{job_id}/images/{index}` – Serve image `index` of
  a stored result as a file, or 404. Mounted **without** the API key (see the
  README "Security model") so `<img>` tags can load it; it only serves files
  inside `SDNEXT_OUTPUT_DIR`.
- `GET /v1/generation/progress/{job_id}` – Poll SDNext progress directly.

Queued jobs store each image saved to disk as a file reference,
`output://<path relative to SDNEXT_OUTPUT_DIR>`, in `result.images`, never as
base64; `return_format` only shapes the response of immediate requests
(`/generate`, `/compose-and-generate`). The WebSocket `generation_complete`
message carries the same browser-loadable sources as `image_url`.

### Recommendations (`/v1/recommendations`)

- `GET /v1/recommendations/similar/{lora_id}` – Return similar adapters using
  the embeddings index.
- `POST /v1/recommendations/for-prompt` – Suggest adapters that complement a
  prompt.
- `GET /v1/recommendations/stats` – Summarise embedding status and usage.
- `POST /v1/recommendations/embeddings/compute` – Queue embedding computation
  for the listed adapters, or every active adapter with `compute_all` (requires
  ML stack). Returns `202` with a recommendation job.
- `GET /v1/recommendations/embeddings/{lora_id}` – Inspect the embedding status
  for an adapter.
- `POST /v1/recommendations/embeddings/{lora_id}/compute` – Queue embedding
  computation for a specific adapter, optionally forcing recomputation.
  Returns `202` with a recommendation job, or `404` for an unknown adapter.
- `POST /v1/recommendations/feedback` – Persist explicit user feedback for
  recommendation quality tuning.
- `POST /v1/recommendations/preferences` – Store user preference profiles that
  influence future recommendations.
- `POST /v1/recommendations/index/rebuild` – Queue a refresh of the similarity
  index used by the recommendation engine. Returns `202` with a recommendation
  job.
- `GET /v1/recommendations/jobs/{job_id}` – Poll a recommendation job; `404`
  for an unknown or expired id.
- `GET /v1/recommendations/health` – Summarise runtime health checks and
  readiness for the recommendation subsystem.
- Feedback and preference persistence requires the optional feedback storage
  configured in `RecommendationService`.

Embedding computation and index rebuilds can take minutes, so those three
endpoints only enqueue the work. Each returns a `RecommendationJobRead`:

```jsonc
{
  "job_id": "3f0c…",            // 32 hex characters
  "kind": "embeddings_batch",   // or "embedding", "index_rebuild"
  "status": "queued",           // "queued" | "running" | "succeeded" | "failed"
  "created_at": "…", "started_at": null, "finished_at": null,
  "result": null,
  "error": null
}
```

Once `status` is `succeeded`, `result` holds what the endpoint used to return
directly: a `BatchEmbeddingResponse` (`embeddings_batch`), an
`EmbeddingComputeResponse` (`{"status": "success", "message": …}`, `embedding`)
or an `IndexRebuildResponse` (`index_rebuild`). A `failed` job carries a generic
`error` message; the details are only logged on the server. With Redis the jobs
run on the RQ worker (same queue as deliveries); without it they run in the API
process, one at a time behind generation jobs, and their status is kept in
memory, so it is lost on restart. Finished jobs can be polled for 24 hours.

> **Note:** Recommendation endpoints ignore the `lora.description` field when
> constructing embeddings or scores. The description remains available in API
> payloads exclusively for display by client applications.

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

