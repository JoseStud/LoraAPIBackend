# Testing and CI

[← Wiki home](README.md)

A change is done when `npm run ci:check` passes locally and CI is green on the
PR. This page explains what that runs and how to write tests that fit. The
suite-by-suite guide is [`tests/README.md`](../../tests/README.md).

## `npm run ci:check`

[`scripts/ci_check.py`](../../scripts/ci_check.py) runs these in order and
stops at the first failure:

| # | Step | Catches |
| --- | --- | --- |
| 1 | Repository guardrails | Legacy frontend paths (`@/components/import-export`, `GenerationStudio.vue`, `@/providers`), deep cross-feature imports, `cancelGenerationJob` called outside the generation services, generation `stores/results` or `stores/queue` imported outside the feature. Also lints the fixtures in `tests/guardrails/`, which **must fail** lint; if one passes, a boundary rule has stopped working. Never "fix" those fixtures. |
| 2 | `ruff format --check .` and `ruff check .` | Formatting and lint, including docstrings. Ruff is pinned because `format.preview` output changes between releases. |
| 3 | `pytest` | The full backend suite. |
| 4 | `npm run lint` | ESLint, including the import-boundary rules. |
| 5 | `npm run test:unit` | Vitest. |
| 6 | `npm run build` | `vue-tsc --noEmit` type-check, then the Vite build. |
| 7 | `npm run check:bundle` | Dashboard bundle budget, and that the JobQueue widget is code-split away from the Studio. |

Run pieces on their own while iterating:

```bash
pytest tests/api/test_generation.py -q
npx vitest run tests/vue/composables/useGenerationWidgetBinding.spec.ts
npx vue-tsc --noEmit
ruff format . && ruff check --fix .
```

`pre-commit install` adds the Ruff hooks locally.

## CI jobs

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml):

| Job | What it does |
| --- | --- |
| Unified quality checks | `npm run ci:check` on Python 3.11 and Node 20; uploads the bundle report. |
| Ensure `node_modules` is absent | Fails if `node_modules/` was committed. |
| Production build validation | `npm run prod:build` on Linux and Windows. |
| Backend demo integration | `make demo-check` twice (real PostgreSQL, Redis, RQ worker and simulated SDNext), proving clean start and repeatability. |

Never merge while *Unified quality checks* or *Production build validation*
fails.

## Backend tests (pytest)

- Location: `tests/` top level, plus `tests/api/` (HTTP through `TestClient`),
  `tests/services/`, `tests/generation/`, `tests/recommendations/`,
  `tests/integration/`.
- Database: each test gets an in-memory SQLite session (`db_session` fixture
  in [`tests/conftest.py`](../../tests/conftest.py)).
- Autouse fixtures give every test an isolated service container builder, stub
  `JobRecovery.start`, and stop the in-process job runner afterwards.
- Useful fixtures: `client` (a `TestClient` wired to the test session),
  `adapter_service`, `delivery_service`, `compose_service`, `mock_storage`,
  and `in_process_jobs`, a gate for controlling when in-process jobs run.
- Swap services with `app.dependency_overrides[get_services]` or
  `builder.with_overrides(...)` inside `service_container_builder_scope()`
  ([Backend](Backend.md#overriding-services-in-tests)).
- External services are mocked: no Redis, SDNext or ML stack needed. Unset
  `REDIS_URL` in your shell, or some queue tests will try to connect.
- `tests/api/test_route_handlers.py` fails on `async def` handlers that never
  await.

## Frontend tests (Vitest)

- Location: `tests/vue/` (components, composables, stores, services),
  `tests/integration/` (mocked API workflows). Config in
  [`vitest.config.js`](../../vitest.config.js).
- The global setup ([`tests/setup/vitest.setup.js`](../../tests/setup/vitest.setup.js))
  creates a fresh Pinia per test and disposes stores afterwards. Keep setup
  files free of app imports: anything they load is cached before a spec's
  `vi.mock()` runs, and the mock silently stops applying.
- Mock the module the code under test actually imports (for example
  `@/features/history/services/historyService`), not a barrel it no longer uses.
- Fixtures must satisfy the Zod schemas; `tests/fixtures/adapters.js` builds a
  valid adapter record.
- Composables that share state through a store must be tested from **separate
  calls** to the composable, not just several `acquire()` calls on one
  instance. Per-call watchers only misbehave in the first case.
- A spec named in the regression matrix must contain real assertions;
  `it.todo` and skipped tests don't count.

## Contract tests

- WebSocket messages: `tests/fixtures/generation_websocket_contract.json`,
  checked by `tests/test_websocket_contract.py` and
  `tests/vue/services/generation/websocketContract.spec.ts`. Regenerate with
  `UPDATE_WS_CONTRACT=1 pytest tests/test_websocket_contract.py` only for a
  deliberate backend change.
- Readonly façade types: `features/generation/orchestrator/facade.readonly.test-d.ts`,
  a type-level test that fails to compile if the façade exposes mutable state.

## Other suites (not in `ci:check`)

| Suite | Command | Needs |
| --- | --- | --- |
| Playwright E2E | `npm run test:e2e` | A running backend, Playwright browsers (`npx playwright install`) |
| Lighthouse | `npm run test:performance` | A served build |
| Coverage | `npm run test:coverage` | — |
| Demo integration | `make demo-check` | Docker |

## Regression matrix

For cross-cutting PRs, run the relevant rows of the
[cross-PR regression matrix in AGENTS.md](../../AGENTS.md#cross-pr-regression-matrix)
(orchestrator lifecycle, visibility/offline, widgets without Studio, HTTP
errors, immutability, performance, boundaries, backend parity) and note the
results in the PR.

Next: [Contributing recipes](Contributing.md).
