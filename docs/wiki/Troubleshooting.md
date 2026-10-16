# Troubleshooting

[← Wiki home](README.md)

Known failure modes and what causes them. For ROCm/GPU problems see
[ROCM_TROUBLESHOOTING.md](../ROCM_TROUBLESHOOTING.md).

## Generation

### Jobs stay `pending` forever

With `REDIS_URL` set, the API only enqueues; an RQ worker must run the job.

- Check the worker is up: `make dev-logs` (look for `lora-dev-worker`).
- The worker must listen on the **same** Redis URL and the `default` queue.
- On the host, start one yourself:
  `rq worker --with-scheduler --url "$REDIS_URL" default`.
- Or unset `REDIS_URL` to use the in-process runner
  ([Generation pipeline](Generation-Pipeline.md#the-in-process-fallback)).

### Jobs fail with "SDNext backend not configured"

`SDNEXT_BASE_URL` is empty. Set it in `.env.docker` (or your shell) for both
the API and the worker. See [Configuration](Configuration.md#sdnext).

### SDNext is unreachable from Docker

- Start SDNext with `--listen` so it accepts connections from outside
  `localhost`.
- From containers, use `http://host.docker.internal:7860`; the Compose file
  maps that name to the host gateway.
- A host firewall may block the Docker bridge. Test from the API container:

  ```bash
  docker compose -f docker-compose.dev.yml exec api python -c "import urllib.request as u; print(u.urlopen('http://host.docker.internal:7860/sdapi/v1/progress').status)"
  ```

- With `--auth`, set `SDNEXT_USERNAME` and `SDNEXT_PASSWORD`.

Full setup: [CUSTOM_SETUP.md](../CUSTOM_SETUP.md).

### Failed jobs are never retried

RQ retries need a scheduler. Workers must run `rq worker --with-scheduler`
(the Compose `worker` does). Also check `DELIVERY_MAX_RETRIES` is above 0.
In-process jobs (no Redis) never retry by design.
See [Generation pipeline](Generation-Pipeline.md#retries).

### Jobs are failed after a restart

Expected. Without Redis, startup fails every `running` job (its runner died
with the old process) and requeues waiting ones. With Redis, jobs `running`
longer than `JOB_RUNNING_TIMEOUT_SECONDS` are failed. If long generations are
being cut off, raise `SDNEXT_TIMEOUT` or set `JOB_RUNNING_TIMEOUT_SECONDS`.
See [Generation pipeline](Generation-Pipeline.md#recovery).

### Result images return 404

The images endpoint returns 404 for an unknown job, a missing index, or a file
outside `SDNEXT_OUTPUT_DIR`.

- The API and the worker must share `SDNEXT_OUTPUT_DIR` (`./outputs` in
  Docker). If only the worker can see the directory, the API can't serve it.
- If `SDNEXT_OUTPUT_DIR` changed after a job ran, its `output://` references
  now resolve somewhere else.

### `outputs/` (or other bind mounts) owned by root

Docker creates missing bind-mount directories as root. `make dev` creates
`outputs/` first; if it already exists as root, `sudo chown -R "$USER" outputs`.
Set `HOST_UID`/`HOST_GID` in `.env.docker` if your IDs aren't 1000.

## Frontend

### The built SPA is not served

`uvicorn app.main:app` and `npm run prod:serve` serve the bundle from
`app/dist/` (`SPA_DIST_DIR` in `app/main.py`), which is where `npm run build`
and `npm run prod:build` write it (Vite's root is `app/frontend` with
`outDir: '../dist'`). `tests/api/test_spa_static.py` fails if the two drift
apart.

If every page returns 404, `app/dist/index.html` doesn't exist: run
`npm run prod:build` and reload. The server picks up a new build without a
restart. Any path that isn't a file in `app/dist/` gets `index.html`, so
client-side routes load on refresh.

During development use the Vite dev server (`npm run dev`), which doesn't
need a build.

### The SPA can't reach the API

- `/frontend/settings` decides the base URL the SPA uses. If `BACKEND_URL` is
  absolute, it must be reachable **from the browser**, not from a container.
- In the Vite dev server, `BACKEND_URL` or `VITE_BACKEND_URL` sets the proxy
  target for `/api` (and `WEBSOCKET_URL`/`VITE_WEBSOCKET_URL` for `/ws`).
- A CORS error means the page's origin isn't in `CORS_ORIGINS`.

### Polling seems to stop

By design: pollers built on `usePolling` and the generation transport pause
while the tab is hidden or offline, and run once when it returns.

## Recommendations

### Recommendations are empty or limited

The ML stack is optional and not installed by default. Install
`requirements-ml.txt` (or `INSTALL_ML=true` and rebuild), then compute
embeddings. See [Recommendations](Recommendations.md#optional-ml-stack).

## Tests and CI

### Queue tests try to connect to Redis

`REDIS_URL` is set in your shell. Unset it before running `pytest`.

### `ruff format --check` disagrees with your editor

Ruff is pinned in `dev-requirements.in` because `format.preview` output
changes between releases. Use the pinned version
(`pip install -r dev-requirements.txt`) or `pre-commit run --all-files`.

### A guardrail fixture "passes lint"

The fixtures in `tests/guardrails/` are meant to **fail** lint. If `ci:check`
reports that one passed, a boundary rule in `.eslintrc.cjs` stopped matching.
Fix the rule, never the fixture.

### "backend.ts is out of date with the backend's OpenAPI schema"

A request or response model, route or enum changed without regenerating the
frontend types. Run `npm run generate:api-types`, fix any type errors in
`app/frontend/src/types/`, and commit `backend.ts`. If the generator says it
cannot export the schema, install the backend dependencies or point `PYTHON`
at the virtualenv's interpreter
([api-type-generation.md](../api-type-generation.md)).

### `async def` handler test fails

`tests/api/test_route_handlers.py` rejects `async def` handlers that never
await. Make the handler a plain `def`, or await its blocking work through
`run_in_threadpool`. See [Backend](Backend.md#handlers-and-the-event-loop).

### `alembic check` reports differences

A model changed without a migration. Add a revision
([Data model](Data-Model.md#adding-a-schema-change)).

### Bundle budget fails

`npm run check:bundle` fails when the dashboard grows past its budget or the
JobQueue widget pulls in Studio code. Load generation widgets through
`import('@/features/generation/public/widgets')` and don't import Studio
composables from dashboard code.
