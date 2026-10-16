# Glossary

[← Wiki home](README.md)

Terms as this codebase uses them.

## Domain

**Adapter / LoRA**
: A LoRA model file (`.safetensors`) plus its metadata, stored as a row in the
  `adapter` table. "Adapter" is the backend's name, "LoRA" the UI's.
  See [Data model](Data-Model.md#tables).

**Active adapter**
: An adapter with `active = true`. Compose builds a prompt from the active
  adapters, ordered by `ordinal`, as `<lora:NAME:weight>` tokens.

**Library / import path**
: The folder of LoRA files and Civitai JSON metadata under `IMPORT_PATH` that
  the importer scans. See [Library import](Library-Import.md).

**SDNext**
: The external Stable Diffusion server that renders images. It runs one job at
  a time and its progress and interrupt endpoints are global.

## Jobs and queues

**Delivery job**
: A `deliveryjob` row: one unit of queued work with `prompt`, `mode`,
  `params`, `status` and `result`. A **generation job** is a delivery job whose
  `mode` is a generation backend (`sdnext`).

**Generation backend**
: A plug-in that renders images (`GenerationBackend`); `sdnext` is the only
  one.

**Delivery backend**
: A plug-in that sends a prompt somewhere else (`DeliveryBackend`): `http` or
  `cli`.

**Runner**
: Whatever executes a job: an RQ worker, or the in-process job runner.

**In-process job runner**
: `InProcessJobRunner`, the fallback when `REDIS_URL` is unset: one thread with
  one event loop inside the API, running jobs one at a time in FIFO order,
  without retries.

**Queue orchestrator**
: `QueueOrchestrator`, which picks the Redis/RQ backend when available and the
  in-process fallback otherwise. All enqueueing goes through it.

**Claim**
: Moving a job from `pending` or `retrying` to `running` with a conditional
  update. Only one runner can win; a runner that loses skips the job.

**`retrying`**
: The job's attempt raised and RQ will run it again after a delay.

**Recovery**
: `JobRecovery`, which fails jobs stuck in `running` past
  `JOB_RUNNING_TIMEOUT_SECONDS` and, without Redis, requeues waiting jobs at
  startup.

**`output://` reference**
: How a job result points at a saved image: a path relative to
  `SDNEXT_OUTPUT_DIR`. The browser loads it from
  `/v1/generation/results/{job_id}/images/{index}`.

**`client_ref`**
: An opaque tag a caller attaches to a queued generation; it is echoed back in
  the job-finished webhook.

**Webhook**
: The optional `generation.finished` POST to `JOB_WEBHOOK_URL` when a queued
  generation succeeds or fails.

## Backend structure

**ServiceRegistry**
: The only service container: one database session, every service a lazily
  built `cached_property`. Routers receive it through `get_services`.

**ServiceFactories**
: The frozen dataclass of `make_*` functions that build each service. Tests
  replace fields with `builder.with_overrides(...)`.

**Service container builder**
: `ServiceContainerBuilder`, the process-wide object that creates registries
  and caches shared pieces (queue orchestrator, GPU check).

**Lifespan**
: FastAPI's startup/shutdown hook in `backend/main.py`: migrations, delivery
  registration, job recovery, model preload, optional import.

## Frontend structure

**Feature package**
: A folder under `app/frontend/src/features/` that owns one area of the UI.

**Public surface**
: A feature's `public.ts` (or `public/` folder), the only path other code may
  import it through.

**Orchestrator**
: The generation feature's shared state and transport: queue, results, system
  status, polling and WebSocket.

**Orchestrator manager**
: `useGenerationOrchestratorManager()` and its store, which counts consumers
  and starts or stops the orchestrator's effects.

**Binding**
: What `acquire()` returns: the consumer's handle carrying every command.
  `release()` ends it; afterwards it is inert.

**Façade**
: `useGenerationOrchestratorFacade()`, a read-only view of the orchestrator
  store that registers no consumer.

**Widget binding**
: `useGenerationWidgetBinding(label)`, a binding that dashboard widgets acquire
  on mount and release on unmount.

**Transport**
: The combination of HTTP queue polling and the progress WebSocket
  (`transportAdapter` / `transportModule`).

**System status controller**
: The single `/system/status` poller per backend, shared by the Studio and the
  dashboard.

**Studio**
: The `/generate` page: generation form, queue and results.

## Recommendations

**Embedding**
: Vectors computed from an adapter's text and metadata by the ML stack
  (semantic, artistic and technical), stored per adapter in `loraembedding`.

**Similarity index**
: The FAISS index over adapter embeddings used to find similar LoRAs. Rebuilt
  by a background job.

See [Recommendations](Recommendations.md).
