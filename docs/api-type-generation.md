# API Type Generation Workflow

The frontend type definitions for API payloads are generated from the FastAPI
OpenAPI schema. Keeping the generated types in sync ensures our Vue +
TypeScript code stays aligned with backend contracts.

## Prerequisites

* Node dependencies: `npm ci`
* Python backend dependencies: `pip install -r requirements.txt` (the schema is
  exported from the backend code, so the generator needs a Python interpreter
  that can import `backend.main`).

The generator script ([`scripts/generate-api-types.mjs`](../scripts/generate-api-types.mjs))
uses [`openapi-typescript`](https://github.com/drwpow/openapi-typescript).

## Generating Types

```bash
npm run generate:api-types
```

The script runs [`scripts/export_openapi.py`](../scripts/export_openapi.py),
which writes `backend.main.create_app().openapi()` to a temporary JSON file.
Building the app does not run its lifespan, so no server, database, Redis or
GPU is involved. openapi-typescript then turns that file into
`app/frontend/src/types/generated/backend.ts`.

There is no fallback. If the schema cannot be exported (for example the Python
dependencies are missing) the script exits non-zero instead of generating
types from a stale copy. The interpreter is `python` (then `python3`); set
`PYTHON` to pick another, such as a virtualenv's.

The main entry point is `backend.ts`, which contains the full set of `paths`,
`components`, and `operations` emitted by the generator. The convenience module
`app/frontend/src/types/generated/index.ts` re-exports these symbols and
exposes a `BackendSchemas` helper alias.

Only routes registered by `create_app()` appear in the schema, which is every
API route, `GET /v1/frontend/settings` (`FrontendSettings`) included.
`app/main.py` adds only the SPA files and its liveness `/health`.

## Updating Frontend Types

Most domain-specific type files under `app/frontend/src/types/` re-export or
wrap the generated schema types. When backend contracts change:

1. Regenerate types with `npm run generate:api-types`.
2. Inspect the diff in `app/frontend/src/types/generated/backend.ts`.
3. Update any thin wrappers that add frontend-specific conveniences (for
   example, casting JSON blobs or adding optional UI-only fields).
4. Run `npm run type-check` to ensure the frontend still compiles.

Commit both the updated generated file(s) and any manual wrappers in the same
changeset so reviewers can trace schema updates end-to-end.

## Other Sources and Output Paths

* `OPENAPI_SPEC` (or the first positional argument) – a path or URL to
  generate from instead of the exported schema, for example a running server's
  `http://localhost:8000/openapi.json`.
* `--out <file>` – write the types somewhere other than `backend.ts`.

```bash
node scripts/generate-api-types.mjs http://localhost:8000/openapi.json --out /tmp/backend.ts
```

## Continuous Integration

The generated file is committed to version control. `npm run ci:check` (and so
the *Unified quality checks* CI job) has an "API types up to date" step: it
regenerates the types from `create_app()` into a temporary file and fails,
printing the diff, when the result differs from the committed `backend.ts`.
The output is deterministic (no timestamps; keys in the order FastAPI emits
them), so the step only fails on a real schema change. To fix it, run
`npm run generate:api-types` and commit the result; never edit `backend.ts` by
hand.
