# Recommendations

[← Wiki home](README.md)

Suggests adapters similar to a given adapter, adapters that fit a prompt, and
adapters matching a trigger word. It runs on embeddings computed from each
adapter's actionable metadata (trained words, triggers, activation text,
tags); `description` is shown in the UI but not used for scoring.

The design document, [RECOMMENDATION_MODEL_DESIGN.md](../RECOMMENDATION_MODEL_DESIGN.md),
describes a larger system than the code implements. Treat this page and the
code as the current state.

## Optional ML stack

The models need `requirements-ml.txt`: PyTorch (ROCm build), transformers,
sentence-transformers and FAISS. Install it on the host, or set
`INSTALL_ML=true` in `.env.docker` and rebuild.

Every ML import is lazy and guarded. Without the stack the app starts, the
tests pass, and recommendation endpoints return limited results.
GPU problems on AMD hardware: [ROCM_TROUBLESHOOTING.md](../ROCM_TROUBLESHOOTING.md).

## Code map

All under [`backend/services/recommendations/`](../../backend/services/recommendations):

| Module | Role |
| --- | --- |
| `service.py` – `RecommendationService` | Serves queries (`similar_loras`, `recommend_for_prompt`, `recommend_for_trigger`), stats, embedding status, feedback and preferences. Calls the functions in `strategies.py` directly. |
| `embeddings.py` – `EmbeddingService` | The one entry point for GPU detection, model preloading and embedding work: per-adapter and batch computation, building and refreshing the similarity index (cached at `cache/similarity_index.pkl`). |
| `strategies.py` | The query algorithms: `get_similar_loras`, `get_recommendations_for_prompt`, `get_recommendations_for_trigger`. |
| `model_registry.py` – `RecommendationModelRegistry` | Process-wide model instances, shared by every service instance; rebuilt only for a different device. |
| `features.py`, `encoders.py`, `engine.py`, `triggers.py`, `scoring.py` | Feature extraction, embedders, the recommendation engine, trigger resolution, score weighting. |
| `repository.py` | Database access for embeddings, sessions, feedback, preferences. |

From a request, reach them as `services.recommendations` and
`services.recommendations.embeddings`.

**Everything here is synchronous** (database, model loading, encoding). Call it
from plain `def` handlers or through `asyncio.to_thread`, as the worker tasks
in [`backend/workers/tasks.py`](../../backend/workers/tasks.py) do.

## Startup

The lifespan calls `EmbeddingService.preload_models` in a thread. Failure only
logs a warning, and models load lazily on first use instead. The GPU check runs
once per process and is cached by the service container builder.

## Background jobs

Embedding computation and index rebuilds can take minutes, so their endpoints
only enqueue work and return `202` with a job to poll:

| Endpoint | Job kind | Worker task |
| --- | --- | --- |
| `POST /v1/recommendations/embeddings/compute` | `embeddings_batch` | `process_embeddings_batch` |
| `POST /v1/recommendations/embeddings/{lora_id}/compute` | `embedding` | `compute_single_embedding` |
| `POST /v1/recommendations/index/rebuild` | `index_rebuild` | `rebuild_similarity_index` |

Poll with `GET /v1/recommendations/jobs/{job_id}`. Status is `queued`,
`running`, `succeeded` or `failed`; `result` holds the old synchronous response
once it succeeds; errors are generic and details only logged.

[`RecommendationJobService`](../../backend/services/recommendation_jobs.py)
(`services.recommendation_jobs`) decides where the job runs:

- **With Redis:** enqueued by dotted path on the same RQ queue as deliveries;
  RQ keeps status and result. Finished jobs can be polled for 24 hours.
- **Without Redis** (or if the Redis enqueue fails): the async variant of the
  task runs on the in-process job runner, behind any generation jobs, so
  embeddings never compete with SDNext for the GPU. Status lives in a bounded
  in-memory `RecommendationJobStore` and is lost on restart.

Never run long recommendation work inside a request.

## Scripts

- [`scripts/recompute_embeddings.py`](../../scripts/recompute_embeddings.py):
  recompute embeddings outside the API.

## Tests

`tests/recommendations/`, `tests/api/test_recommendation_jobs.py` and
`tests/api/test_recommendation_queries.py` use mocked embeddings, so they run
without the ML stack.

Next: [Library import and archives](Library-Import.md).
