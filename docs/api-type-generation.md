# API Type Generation Workflow

The frontend type definitions for API payloads are generated from the FastAPI
OpenAPI schema. Keeping the generated types in sync ensures our Vue +
TypeScript code stays aligned with backend contracts.

## Prerequisites

* Install Node dependencies: `npm install`
* The generator script uses [`openapi-typescript`](https://github.com/drwpow/openapi-typescript).
  It can consume either the live FastAPI schema (`/openapi.json`) or the
  snapshot stored in `openapi_example.yaml`.

## Generating Types

```bash
npm run generate:api-types
```

The script attempts to download the schema from `http://localhost:8000/openapi.json`.
If the backend is not running it automatically falls back to
`openapi_example.yaml` in the repository root.

Generated files are written to `app/frontend/src/types/generated/`. The main
entry point is `backend.ts`, which contains the full set of `paths`,
`components`, and `operations` emitted by the generator. The convenience module
`app/frontend/src/types/generated/index.ts` re-exports these symbols and
exposes a `BackendSchemas` helper alias.

## Updating Frontend Types

Most domain-specific type files under `app/frontend/src/types/` now re-export or
wrap the generated schema types. When backend contracts change:

1. Regenerate types with `npm run generate:api-types`.
2. Inspect the diff in `app/frontend/src/types/generated/backend.ts`.
3. Update any thin wrappers that add frontend-specific conveniences (for
   example, casting JSON blobs or adding optional UI-only fields).
4. Run `npm run type-check` to ensure the frontend still compiles.

Commit both the updated generated file(s) and any manual wrappers in the same
changeset so reviewers can trace schema updates end-to-end.

## Customising the Source Schema

Set the following environment variables when running the generator:

* `OPENAPI_SPEC` – Absolute or relative path/URL to the desired schema.
* `OPENAPI_FALLBACK` – Optional fallback path/URL if the primary source is
  unavailable.

Example:

```bash
OPENAPI_SPEC="https://staging.example.com/openapi.json" npm run generate:api-types
```

## Continuous Integration

The generated file is committed to version control. Pull requests should run
`npm run generate:api-types` after making backend schema changes and include the
resulting diff. CI will catch stale types via the TypeScript check in
`npm run type-check`.
