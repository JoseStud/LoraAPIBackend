# LoRA Manager

[![CI](https://github.com/JoseStud/LoraAPIBackend/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JoseStud/LoraAPIBackend/actions/workflows/ci.yml)

A FastAPI + Vue application for managing LoRA adapters and queuing image generation.
The backend demonstration follows one complete feature: submit a generation job,
process it with a separate worker, store its result, and retrieve it after an API restart.

## Run the backend demonstration

Prerequisites: Docker with Compose v2.20+, GNU Make and a POSIX shell (Linux,
macOS or WSL). Allow several minutes and internet access for the first image build.
No GPU, model download, Python installation or personal configuration is needed.

```sh
git clone https://github.com/JoseStud/LoraAPIBackend.git
cd LoraAPIBackend
make demo
make demo-check
```

Open [interactive API documentation](http://127.0.0.1:18000/api/docs).
Use **Authorize → `demo-token`**. This is a public, disposable demo value.

The API, PostgreSQL, Redis and RQ worker are real. **SDNext is simulated** over
HTTP and returns a fixed blue PNG; this demonstrates backend engineering, not
image quality or GPU performance. The API binds only to loopback port 18000.
The separate `lora-demo` Compose project uses its own volumes and does not load
private environment files or mount your adapter collection.

`make demo-check` verifies migrations, validation, a job waiting while the worker
is stopped, completion, PNG storage, persistence after restart, safe upstream
failures, and worker recovery. It always selects the simulator. Run it twice to
check repeatability; CI does the same.

```sh
make demo-down   # stop; retain demo history and images
make demo-reset  # delete only the lora-demo containers and volumes
```

**Inspect:** [feature walkthrough, API examples and tradeoffs](docs/BACKEND_DEMO.md)
· [captioned recording and tested revision](https://github.com/JoseStud/LoraAPIBackend/releases/tag/backend-demo-v1)
· [walkthrough transcript](docs/DEMO_WALKTHROUGH.md).

## Development

The [single Compose configuration](docker-compose.dev.yml) also supports the
full development stack. Copy `.env.docker.example` to `.env.docker`, configure
an external SDNext if needed, then run `make dev`. The API uses port 8000 and
Vite uses 5173. `make dev-down` retains data; `make dev-clean` deletes development
volumes. `make dev-ml` enables the optional SDNext container profile.
See [custom SDNext setup](docs/CUSTOM_SETUP.md).

For host development, use Python 3.11 and Node 20:

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt -r dev-requirements.txt
PUPPETEER_SKIP_DOWNLOAD=true npm ci
uvicorn app.main:app --reload --port 8000
# In another terminal:
npm run dev
```

Python dependencies are pinned. Edit the `.in` files and run `make deps-lock`
when changing them. ML recommendations use optional `requirements-ml.txt`.
The host backend defaults to SQLite; generation requires a reachable SDNext.

## Tests and CI

```sh
npm run ci:check  # guardrails, Ruff, pytest, ESLint, Vitest, typecheck/build, bundle budget
make demo-check  # real PostgreSQL + Redis + RQ + HTTP integration
```

CI runs both, plus production builds on Linux and Windows. Browser E2E and
performance suites are separate: see the [testing guide](tests/README.md).
`npm run prod:build` creates the production frontend bundle.

## Scope and limitations

Other implemented areas include adapter CRUD, prompt composition, import/export,
analytics and a Vue dashboard. Recommendations need optional ML dependencies;
WebSocket progress remains experimental. The demonstration covers queued
text-to-image generation and does not validate those other workflows, image
quality, GPU throughput, multi-user isolation or crash recovery during inference.

## Security model

This is a **single-user tool for a trusted local network**. It has no user
accounts. The optional `X-API-Key` value is returned by the unauthenticated
`/frontend/settings` endpoint so the frontend can use it; it is not an access
control. Some system endpoints and the progress WebSocket do not check it.
Unexpected errors return generic client messages and details go to server logs.

Do not expose the backend directly to the internet. Remote use requires a VPN
or a proxy providing its own authentication.

## More documentation

- [Backend feature demonstration](docs/BACKEND_DEMO.md)
- [Developer guide](docs/DEVELOPMENT.md)
- [API contract](docs/contract.md)
- [Testing guide](tests/README.md)
