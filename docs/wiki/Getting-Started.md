# Getting started

[← Wiki home](README.md)

There are three ways to run the project. Pick by what you need.

| Goal | Command | What you get |
| --- | --- | --- |
| See the backend work end to end, no setup | `make demo` then `make demo-check` | Isolated `lora-demo` Compose project: PostgreSQL, Redis, RQ worker and a **simulated** SDNext that returns a blue PNG. API on `127.0.0.1:18000`. See [BACKEND_DEMO.md](../BACKEND_DEMO.md). |
| Day-to-day development | `make dev` | API with hot reload, RQ worker, Vite dev server, PostgreSQL, Redis. Optional SDNext container with `make dev-ml`. |
| Debug without Docker | uvicorn + `npm run dev` on the host | SQLite by default, in-process job runner unless you set `REDIS_URL`. |

## Prerequisites

- Docker with Compose v2.20+ and GNU Make for the Compose workflows.
- For host development: Python 3.11 and Node 20.
- For real image generation: a reachable SDNext install
  ([CUSTOM_SETUP.md](../CUSTOM_SETUP.md)). Without one, everything except
  generation works, and generation jobs fail with "SDNext backend not
  configured".

## Docker development stack (`make dev`)

```bash
cp .env.docker.example .env.docker   # optional; the Makefile falls back to the example
make dev
```

Services defined in [`docker-compose.dev.yml`](../../docker-compose.dev.yml):

| Service | Purpose | Host port |
| --- | --- | --- |
| `api` | `uvicorn backend.main:app --reload` (API only, routes under `/v1`) | 8000 |
| `worker` | `rq worker --with-scheduler … default`, restarted by `watchfiles` when `backend/` changes | — |
| `frontend` | Vite dev server | 5173 |
| `db` | PostgreSQL 15 | `DB_HOST_PORT` (5432) |
| `redis` | Redis 7 | — |
| `sdnext` | Optional, `ml` profile only (`make dev-ml`) | — |

Things worth knowing:

- `REDIS_URL` is set, so the API **only enqueues** generation jobs and the
  `worker` runs them. If jobs sit in `pending`, check the worker logs
  (`make dev-logs`).
- `./outputs` is bind-mounted into both `api` and `worker` as
  `SDNEXT_OUTPUT_DIR`: the worker writes images, the API serves them. The
  Makefile creates it first so it is not owned by root.
- `LORA_HOST_DIR` (default `./loras`) is mounted as `/app/loras`, the
  importer's `IMPORT_PATH`. Point it at SDNext's `models/Lora` folder so both
  see the same files.
- `INSTALL_ML=true` in `.env.docker` installs the optional ML stack (PyTorch
  ROCm, several GB) into the API image; rebuild with `make dev`.
- `make dev-down` stops and keeps data; `make dev-clean` also deletes volumes.

## Host development

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt -r dev-requirements.txt
PUPPETEER_SKIP_DOWNLOAD=true npm ci
uvicorn app.main:app --reload --port 8000
```

In another terminal:

```bash
npm run dev
```

With no `DATABASE_URL` the backend uses `db.sqlite` in the repository root and
migrates it on startup. With no `REDIS_URL` generation jobs run in the API
process (see [Generation pipeline](Generation-Pipeline.md#the-in-process-fallback)).

## Two backend entry points

| Entry point | Mounts | Used by |
| --- | --- | --- |
| [`backend/main.py`](../../backend/main.py) `create_app()` (also exposed as the factory `backend.main:app`) | API routers under `/v1`, `/health` | Docker `api` service, tests |
| [`app/main.py`](../../app/main.py) `app` | The backend app at `/api` (so routes are `/api/v1/...`), `/frontend/settings`, `/health`, and the SPA built into `app/dist/` with an `index.html` fallback | Host development, `npm run prod:serve` |

`/frontend/settings` (also `/api/v1/frontend/settings`) gives the SPA its API
base URL, API key and polling intervals. Vite proxies `/api` and `/ws` to the
backend during development (`vite.config.ts`).

## Useful URLs

- Interactive API docs: `http://localhost:8000/docs` (`/api/docs` when running
  `app.main:app`).
- SPA (dev): `http://localhost:5173`.
- Progress WebSocket: `ws://localhost:8000/v1/ws/progress`
  (`/api/v1/ws/progress` through `app.main:app`).

## API key

`API_KEY` (default `dev-token` in Docker) is checked on most routers via the
`X-API-Key` header, but it is **not an access control**: `/frontend/settings`
hands it to any browser. See the README's
[Security model](../../README.md#security-model). In the API docs use
**Authorize** with the key.

## Your first change

1. Branch from `main`.
2. Make the change and its tests.
3. Run `npm run ci:check` until it passes (see [Testing and CI](Testing-and-CI.md)).
4. Open a PR; CI must be green before merge.

Next: [Architecture](Architecture.md).
