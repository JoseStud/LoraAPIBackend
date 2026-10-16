# Contributing recipes

[← Wiki home](README.md)

Step-by-step patterns for the changes people make most often. Each ends with
`npm run ci:check`; see [Testing and CI](Testing-and-CI.md).

## Workflow

1. Branch from `main`.
2. Make the change with its tests.
3. Run `npm run ci:check` until it passes.
4. Open a PR. For cross-cutting changes, note the
   [regression matrix](../../AGENTS.md#cross-pr-regression-matrix) rows you ran.
5. If the PR changes an invariant described in `AGENTS.md`, update `AGENTS.md`
   in the same PR. If it changes something a wiki page describes, update the
   page.

## Add a backend endpoint

1. Put the route in the matching router under `backend/api/v1/` (or a new
   module, included in `create_app()` with the `/v1` prefix and, unless it must
   be keyless, `Depends(get_api_key)`). Don't add ad hoc routes on the app.
2. Request/response models go in `backend/schemas/<area>.py`.
3. Take `services: ServiceRegistry = Depends(get_services)` and call a service;
   keep logic out of the route.
4. Choose the handler type:
   - only synchronous work → plain `def`;
   - needs to await something → `async def`, with synchronous steps wrapped in
     `run_in_threadpool`.
5. Raise `HTTPException` for expected errors. Let unexpected ones propagate;
   the global handler logs them and returns a generic 500. Never put exception
   text in a response.
6. Add a test in `tests/api/`, and update [`docs/contract.md`](../contract.md).
7. If the frontend uses it, regenerate types (`npm run generate:api-types`) and
   add a Zod schema for the response.

## Add a backend service

1. Write the class in `backend/services/` (sync methods for database work).
2. Add a field to `ServiceFactories`, typed `Callable[..., <Name>Service]`,
   and a `cached_property` on `ServiceRegistry`
   ([`service_registry.py`](../../backend/services/service_registry.py)). The
   field's default is the class itself, or a `make_<name>_service` function
   in the same file when the registry's arguments need translating. Raise a
   clear `ValueError` from the property if a needed collaborator is missing.
3. Use it as `services.<name>`. Test it directly and through a registry with
   overridden factories.

Don't instantiate services directly in routers or workers.

## Add a schema change

See [Data model and migrations](Data-Model.md#adding-a-schema-change): change
the model, add a numbered revision under `backend/migrations/versions/`, run
`alembic upgrade head` and `alembic check` on an empty database.

## Add a setting

See [Configuration](Configuration.md#adding-a-setting). Settings live only in
`backend/core/config.py`.

## Add background work

- Generation-like jobs: create a `DeliveryJob` and enqueue through
  `QueueOrchestrator.enqueue_delivery()`, so the in-process fallback keeps
  working. Change status only through `claim_job` / `finish_job` /
  `cancel_job`.
- Other long-running work: follow `RecommendationJobService`
  ([`recommendation_jobs.py`](../../backend/services/recommendation_jobs.py)):
  an RQ task in `backend/workers/tasks.py`, an async variant for the
  in-process runner, and a job id the client polls.
- Never run long work in the request, start threads per request, or call
  `asyncio.run` per job in the API process.

## Add a generation parameter

1. Add the field to `SDNextGenerationParams` (`backend/schemas/generation.py`).
2. Map it into the txt2img payload in `backend/delivery/sdnext_client.py`.
3. Add it to the frontend form store and schema
   (`features/generation/stores/form.ts`, `schemas/generation.ts`) and to
   `createGenerationParams`.
4. Test both sides.

## Add a generation or delivery backend

Implement `GenerationBackend` or `DeliveryBackend` from
[`backend/delivery/base.py`](../../backend/delivery/base.py) and register it in
`_register_builtin_backends`, so `ensure_delivery_system()` picks it up. Look it
up through `get_delivery_registry()`. See [Backend](Backend.md#delivery-and-generation-backends).

## Add a frontend feature or component

1. Put it in `app/frontend/src/features/<name>/` with `components/`,
   `composables/`, `services/`, `stores/` as needed, plus a `public.ts`.
2. Export only what other code needs from `public.ts`. Other features import
   from `@/features/<name>/public`.
3. Wire a route in `router/index.ts` with a lazy `import()`; views live in
   `views/` and stay thin.
4. HTTP goes through `services/shared/http` or `useApi`; validate responses
   with Zod before they reach a store.

## Use generation state in a new place

- **Read-only** (show queue or results): `useGenerationOrchestratorFacade()`
  from `@/features/generation/public`. Starts nothing.
- **Dashboard widget that needs live updates**:
  `useGenerationWidgetBinding(label)`; lazily `import()` the widget from
  `@/features/generation/public/widgets` so the Studio bundle is not pulled in.
- **Anything that issues commands**: acquire a binding with
  `useGenerationOrchestratorManager().acquire(...)` and `release()` it when the
  owner unmounts.
- Test from separate composable calls, and run the orchestrator lifecycle row
  of the regression matrix.

## Add a poller

Use `usePolling` (`composables/shared/usePolling.ts`), start it from its owner,
and call `stop()` on teardown. For anything generation-related, extend the
transport (`stores/orchestrator/transportModule.ts` / `transportAdapter.ts`) or
the shared `systemStatusController` instead.

## Change a WebSocket message

1. Change the backend schema and the code that sends it.
2. Regenerate the contract: `UPDATE_WS_CONTRACT=1 pytest tests/test_websocket_contract.py`.
3. Update `features/generation/services/websocketMessages.ts` until
   `websocketContract.spec.ts` passes.

## Change Python dependencies

Edit `requirements.in` or `dev-requirements.in`, then `make deps-lock` (needs
`uv`). Don't edit the `.txt` lockfiles by hand. Keep `sqlmodel` below 0.0.45
([why](Data-Model.md#version-constraints)).
