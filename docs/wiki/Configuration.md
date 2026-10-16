# Configuration

[← Wiki home](README.md)

Every backend setting is a field on `Settings` in
[`backend/core/config.py`](../../backend/core/config.py), loaded from
environment variables (case-insensitive, unknown variables ignored). Add new
settings there, not as `os.environ` reads elsewhere: startup validation and the
`/frontend/settings` payload rely on one source.

In Docker, values come from `.env.docker` (or `.env.docker.example`) through
[`docker-compose.dev.yml`](../../docker-compose.dev.yml).

## Environment and core services

| Variable | Default | Meaning |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `development`, `test` or `production`. In `production`, `DATABASE_URL`, `REDIS_URL` and `SDNEXT_BASE_URL` are required and startup fails without them. |
| `DATABASE_URL` | unset → SQLite `db.sqlite` in the repo root | Any SQLAlchemy URL, e.g. `postgresql+psycopg://user:pw@host:5432/lora`. See [POSTGRES_SETUP.md](../POSTGRES_SETUP.md). |
| `REDIS_URL` | unset → in-process job runner | Enables the RQ queue. The worker must use the same URL. |
| `API_KEY` | unset → no check | Value expected in `X-API-Key`. Served to the browser by `/frontend/settings`; not an access control. |

## Backend URL and CORS

| Variable | Default | Meaning |
| --- | --- | --- |
| `BACKEND_URL` | unset → `/api/v1` | API base URL the SPA receives from `/frontend/settings`. Absolute URLs are used as-is; paths are normalised to start with `/`. |
| `BACKEND_HOST`, `BACKEND_PORT` | `0.0.0.0`, `8000` | Only used to build `Settings.get_backend_url` when `BACKEND_URL` is unset. uvicorn's own flags decide where the server listens. |
| `CORS_ORIGINS` | `localhost`/`127.0.0.1` on ports 5173 and 8000 | JSON list of allowed origins. |
| `CORS_ALLOW_CREDENTIALS` | `true` | Forced off by `app/main.py` when `CORS_ORIGINS` contains `*`. |

## SDNext

| Variable | Default | Meaning |
| --- | --- | --- |
| `SDNEXT_BASE_URL` | unset → generation disabled | e.g. `http://host.docker.internal:7860` (SDNext on the host, started with `--listen`) or `http://sdnext:7860` (`make dev-ml`). See [CUSTOM_SETUP.md](../CUSTOM_SETUP.md). |
| `SDNEXT_USERNAME`, `SDNEXT_PASSWORD` | unset | For SDNext started with `--auth`. |
| `SDNEXT_TIMEOUT` | `120` | Request timeout in seconds. |
| `SDNEXT_POLL_INTERVAL` | `2` | Seconds between ticks of the API's WebSocket job progress monitor (each tick reads job state and, for the running job, SDNext's progress). |
| `SDNEXT_DEFAULT_STEPS`, `SDNEXT_DEFAULT_SAMPLER`, `SDNEXT_DEFAULT_CFG_SCALE` | `20`, `DPM++ 2M`, `7.0` | Generation defaults. |
| `SDNEXT_OUTPUT_DIR` | unset | Where generated images are written and served from. API and worker must share it (`./outputs` in Docker). |
| `SDNEXT_PRE_GENERATE_COMMAND` | unset | Shell command run and awaited before each generation, e.g. to free the GPU. Failures are logged, not fatal. |
| `SDNEXT_PRE_GENERATE_TIMEOUT` | `30` | Seconds to wait for that command. |

## Jobs: timeouts, recovery, retries

| Variable | Default | Meaning |
| --- | --- | --- |
| `JOB_RUNNING_TIMEOUT_SECONDS` | unset → `SDNEXT_TIMEOUT + SDNEXT_PRE_GENERATE_TIMEOUT + 120` | A job `running` longer than this has lost its runner and is failed by recovery. Also the RQ job timeout. |
| `JOB_RECOVERY_INTERVAL_SECONDS` | `60` | How often recovery runs; `0` runs it only at startup. |
| `GENERATION_WAIT_TIMEOUT_SECONDS` | unset → `2 × JOB_RUNNING_TIMEOUT_SECONDS` | How long `POST /generation/generate` and `/compose-and-generate` wait for their queued job before answering 504 with the job id. The job keeps running. |
| `DELIVERY_MAX_RETRIES` | `2` | RQ retries when the runner raises. `0` disables. In-process jobs never retry. |
| `DELIVERY_RETRY_INTERVAL_SECONDS` | `10` | Retry *n* waits this × 2^(n-1). Above 0 needs `rq worker --with-scheduler`. |

Details: [Generation pipeline](Generation-Pipeline.md#retries).

## Job-finished webhook

| Variable | Default | Meaning |
| --- | --- | --- |
| `JOB_WEBHOOK_URL` | unset → disabled | POSTed a JSON summary when a queued generation succeeds or fails. |
| `JOB_WEBHOOK_TOKEN` | unset | Shared secret sent in the header below. |
| `JOB_WEBHOOK_TOKEN_HEADER` | `X-LoRA-Manager-Token` | Header name for the token. |
| `JOB_WEBHOOK_TIMEOUT` | `5.0` | Seconds; failures are logged and never affect the job. |

See [N8N_INTEGRATION.md](../N8N_INTEGRATION.md).

## Frontend polling

Passed to the SPA through `/frontend/settings` (`generationPolling`).

| Variable | Default | Meaning |
| --- | --- | --- |
| `GENERATION_QUEUE_POLL_INTERVAL_MS` | `2000` | Queue polling. |
| `GENERATION_WEBSOCKET_RETRY_INTERVAL_MS` | `3000` | Delay before reconnecting the progress socket. |
| `GENERATION_SYSTEM_STATUS_POLL_INTERVAL_MS` | `10000` | `/system/status` polling. |

## Library import

| Variable | Default | Meaning |
| --- | --- | --- |
| `IMPORT_PATH` | `/app/loras` | Library root scanned by the importer; also the parent of `backups/` and the disk checked by `/system/status`. |
| `IMPORT_POLL_SECONDS` | `10` | Default `--poll` for `scripts/importer.py`. |
| `IMPORT_IGNORE_PATTERNS` | `[]` | JSON list of globs relative to `IMPORT_PATH`. |
| `IMPORT_ON_STARTUP` | `false` | Run a one-shot import when the API starts. |
| `IMPORT_ON_STARTUP_FORCE_RESYNC` | `false` | …re-processing every file. |
| `IMPORT_ON_STARTUP_DRY_RUN` | `false` | …without writing. |

## System status thresholds

| Variable | Default | Meaning |
| --- | --- | --- |
| `SYSTEM_QUEUE_WARNING_ACTIVE` | `5` | Warn when more jobs than this are active. |
| `SYSTEM_QUEUE_WARNING_FAILED` | `0` | Warn when more jobs than this have failed. |
| `SYSTEM_IMPORTER_STALE_HOURS` | `24` | Warn when the last import is older. |

## Docker-only variables

Read by Compose or the images, not by `Settings`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOST_UID`, `HOST_GID` | `1000` | Container user, so bind-mounted files aren't root-owned. |
| `LORA_HOST_DIR` | `./loras` | Host directory mounted at `/app/loras`. |
| `DB_HOST_PORT` | `5432` | Host port for PostgreSQL. |
| `INSTALL_ML` | `false` | Install `requirements-ml.txt` into the API image. |
| `VITE_BACKEND_URL`, `VITE_BACKEND_API_KEY` | `http://api:8000`, `dev-token` | Vite dev server's backend target and key. |

## Adding a setting

1. Add a typed field with a default and a comment to `Settings`. Use pydantic
   `Field` constraints (`gt=0`, `ge=0`) instead of validating at use sites.
2. If production needs it, add it to `REQUIRED_PRODUCTION_SETTINGS`.
3. If the SPA needs it, add it to `/frontend/settings` in `app/main.py` and to
   the frontend settings schema.
4. Document it in `.env.docker.example` (commented out if it has a sensible
   default) and in this table.
