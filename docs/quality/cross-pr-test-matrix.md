# Cross-PR Regression Test Matrix

This matrix enumerates the manual and automated checks that must stay green when validating changes across pull requests. Each
section explains the scope, the contract we defend, and the concrete test steps or tooling that keep the contract enforceable.

## Lifecycle
- **Scenario**: Two independent consumers mount and unmount the generation orchestrator.
- **Expectation**: Only one underlying transport connection is opened and it is disposed deterministically when the last
  consumer exits.
- **How to test**:
  - Mount the Dashboard and Studio views sequentially, then together, verifying `useGenerationOrchestratorManager` maintains a
    single shared instance.
  - Inspect the orchestrator store debug logs to ensure `acquire()`/`release()` pairs line up and teardown runs once.
  - Run `npm run test -- generation-orchestrator-lifecycle.spec.ts` to cover orchestrator manager lifecycle guards.

## Visibility & Offline Behaviour
- **Scenario**: The app transitions between active, hidden, and offline states.
- **Expectation**: Generation requests pause while hidden/offline and resume without replaying duplicate jobs.
- **How to test**:
  - Trigger the Page Visibility API hooks with DevTools to confirm queue polling pauses while hidden.
  - Use the service worker devtools to toggle offline mode and ensure no HTTP traffic is emitted until connectivity returns.
  - Resume visibility/online state and verify pending jobs reconcile via the transport refresh pathway.

## Widgets without Studio
- **Scenario**: Generation widgets render inside the Dashboard without loading the Studio bundle.
- **Expectation**: Widget actions map visible UI identifiers to backend adapter IDs, and the shared store provides all required
  state without Studio-only imports.
- **How to test**:
  - Load the Dashboard route directly and confirm widgets render with network tab showing adapter summary bootstrap only once.
  - Interact with each widget action (generate, retry, delete) and validate the correct adapter IDs appear in the backend logs.
  - Smoke the `dashboard-widgets.spec.ts` Vitest suite to confirm widgets stay decoupled from Studio-only modules.

## HTTP Error Normalisation
- **Scenario**: Backend returns authentication failures or transient errors.
- **Expectation**: Client normalises 401/403/5xx responses, retries idempotent requests only, and surfaces structured logs.
- **How to test**:
  - Run API client unit tests: `npm run test -- api-client-error-normalisation.spec.ts`.
  - Manually induce 401/403/500 responses (via mocked backend or dev proxy) and confirm toast/log output matches the error
    catalogue.
  - Inspect request inspector logs to verify retry logic only fires for marked idempotent endpoints.

## Immutability Contracts
- **Scenario**: Callers attempt to mutate store state or downstream props.
- **Expectation**: Development builds throw, production builds ignore mutations, and downstream props are typed as `readonly`.
- **How to test**:
  - Execute `npm run test -- store-immutability.spec.ts` to cover runtime guards.
  - Build the production bundle and confirm console warnings are absent when props are mutated.
  - Review TypeScript diagnostics (`npm run lint`) for readonly typing enforcement in component props and composables.

## Performance
- **Scenario**: Rendering large collections and bundling the SPA.
- **Expectation**: Bundle size budgets stay within limits, virtualization scrolls smoothly with 200+ items, and no deep clones run
  in getters or computed paths.
- **How to test**:
  - Run `npm run build` and inspect the bundle analyzer output for budget regressions.
  - Load the gallery with >200 adapters, verifying virtualization FPS in the performance panel stays above 55.
  - Use the performance profiler to ensure getters/computed properties avoid deep-clone operations.

## Architectural Boundaries
- **Scenario**: New imports or public surface changes slip past boundaries.
- **Expectation**: Only modules re-exported from `public.ts` are consumed externally, forbidden imports fail linting, and CI
  fitness tests remain green.
- **How to test**:
  - Execute `npm run lint` to catch import boundary violations.
  - Review `public.ts` exports during code review to ensure new surface area is deliberate.
  - Run the full CI fitness suite locally with `npm run ci:check` prior to submitting the PR.

## Backend Parity Checks
- **Scenario**: Backend endpoints and queues stay aligned with frontend expectations.
- **Expectation**: HTTP contract tests, queue orchestration smoke tests, and Alembic migrations pass without regression.
- **How to test**:
  - Run backend unit tests: `pytest tests/backend`.
  - Execute queue integration smoke tests via `pytest tests/queue`.
  - Validate migrations with `alembic upgrade head` in a disposable database.

## Reporting
- Capture results in the PR checklist template with pass/fail for each section above.
- Attach logs, profiler traces, or screenshots where relevant to document the evidence trail.
