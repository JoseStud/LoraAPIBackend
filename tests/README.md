# Testing guide

The repository bundles unit, integration, and end-to-end tests across Python
and TypeScript. This guide summarises what each suite covers, how to run it, and
the dependencies that may be required.

## Overview

- **Python (pytest)** – Validates backend services, repositories, API routers,
  and worker helpers. Fixtures live in `tests/conftest.py` and rely on in-memory
  SQLite databases by default.【F:tests/conftest.py†L1-L120】
- **Vitest** – Runs component, composable, and store tests under
  `tests/unit` and `tests/vue`.
- **Integration tests** – Additional Vitest suites under `tests/integration`
  exercise frontend logic that talks to the backend API via mocked HTTP calls.
- **Playwright** – End-to-end browser tests under `tests/e2e` simulate user
  flows through the SPA.
- **Performance/Lighthouse** – Optional audits located in `tests/performance`.

## Recommended workflow

1. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   npm install
   ```

   Install `requirements-ml.txt` if you want to run recommendation suites that
   require embeddings. Playwright will download browsers on first run; set
   `PUPPETEER_SKIP_DOWNLOAD=true` if network restrictions apply and install
   browsers manually.

2. **Run backend tests**

   ```bash
   pytest
   ```

   Use markers or `-k` expressions to limit execution when Redis or SDNext are
   unavailable. Many tests provide mocks so they can run without external
   services, but generation-specific tests may be skipped or return placeholder
   assertions.

3. **Run frontend unit tests**

   ```bash
   npm run test:unit
   ```

4. **Run integration or end-to-end suites as needed**

   ```bash
   npm run test:integration   # mocked API workflows
   npm run test:e2e           # Playwright browser tests
   ```

   Configure `BACKEND_URL` or start the backend when running the Playwright
   suite so the SPA has an API to talk to. Headless Chrome/Firefox/WebKit must
   be installed locally or via CI images.

5. **Optional tooling**

   ```bash
   npm run test:performance   # Lighthouse CI
   npm run test:coverage      # Vitest coverage report
   ```

## Suite structure

```
tests/
├── unit/            # Python and TypeScript unit tests
├── vue/             # Vue component tests
├── integration/     # Frontend integration suites
├── e2e/             # Playwright scenarios
├── performance/     # Lighthouse CI configuration
├── generation/      # Backend generation helpers
├── recommendations/ # Recommendation service tests
└── mocks/           # Shared fixtures and HTTP mocks
```

Refer to the individual test files for scenario specifics. Several suites are
lengthy because they exercise orchestrators, presenters, and data pipelines; use
`pytest -k` or `vitest --runInBand` to focus on the areas you are changing.

## Notes on external services

- **Redis** – Some queue tests attempt to connect to Redis when `REDIS_URL` is
  set. Clear the variable to avoid connection attempts or supply a test Redis
  instance.
- **SDNext** – Generation tests stub HTTP responses, but optional integration
  tests expect a reachable SDNext server. Skip them when the server is not
  available.
- **ML dependencies** – Recommendation tests are designed to run with mocked
  embeddings; installing `requirements-ml.txt` enables full-stack coverage.
- **Playwright browsers** – Use `npx playwright install` if the automatic
  download is skipped.

## Continuous integration tips

- Use `npm run validate` to run ESLint and the default frontend test suite.
- `pytest --maxfail=1` helps surface the first backend failure quickly.
- Group heavier suites (Playwright, Lighthouse) behind optional CI jobs so they
  do not block faster feedback loops.【F:package.json†L5-L31】

