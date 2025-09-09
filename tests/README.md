# Testing Guide

This document provides an overview of the testing strategy, setup, and execution for the LoRA Manager project.

## 1. Testing Philosophy

We employ a multi-layered testing strategy to ensure code quality, prevent regressions, and validate functionality from the lowest-level units to high-level user workflows.

-   **Backend (Python/FastAPI)**: Tested with `pytest`.
-   **Frontend (JavaScript/Alpine.js)**: Tested with `Jest`.
-   **End-to-End (E2E)**: Tested with `Playwright`.

## 2. Test Structure

The `tests/` directory is organized by the type and scope of the tests:

```
tests/
├── e2e/              # End-to-end tests (Playwright)
│   └── lora-manager.spec.js
├── integration/      # Backend integration tests (Pytest)
│   └── test_main.py
├── unit/             # Unit tests
│   ├── backend/      # Backend unit tests (Pytest)
│   │   └── test_services.py
│   └── js/           # Frontend unit tests (Jest)
│       └── system-admin.test.js
├── conftest.py       # Pytest configuration and fixtures
├── setup.js          # Jest global setup (mocks, etc.)
└── playwright.config.js # Playwright configuration
```

-   **`unit/`**: Tests for individual functions, classes, or components in isolation.
    -   Backend unit tests (`unit/backend/`) focus on service logic, using mocks for database and external API calls.
    -   Frontend unit tests (`unit/js/`) focus on Alpine.js component logic, using `jest-dom` and mocks for browser APIs.
-   **`integration/`**: Backend tests that verify the interaction between different parts of the system, such as API endpoints and the database. These tests use a test-specific database instance.
-   **`e2e/`**: High-level tests that simulate real user workflows in a browser. They use Playwright to interact with the application, ensuring that the frontend and backend work together correctly.

---

## 3. How to Run Tests

### 3.1. Running All Tests

The simplest way to run all tests (backend and frontend) is with `npm`.

```bash
# Install dependencies if you haven't already
npm install

# Run all test suites
npm test
```

### 3.2. Running Backend Tests (Pytest)

To run only the Python tests for the backend, use `pytest`.

```bash
# Install Python dependencies
pip install -r requirements.txt -r dev-requirements.txt

# Run all backend tests (unit and integration)
pytest

# Run only unit tests
pytest tests/unit/backend/

# Run with verbose output
pytest -v
```

### 3.3. Running Frontend Tests (Jest)

To run only the JavaScript tests for the frontend, use the `npm` script.

```bash
# Run all frontend unit tests
npm run test:unit

# Run in watch mode for active development
npm run test:watch
```

### 3.4. Running End-to-End Tests (Playwright)

E2E tests require a running instance of the application. The Playwright configuration will automatically start the dev server if it's not already running.

```bash
# Run all E2E tests
npm run test:e2e

# Run in headed mode to watch the browser interactions
npx playwright test --headed
```

---

## 4. Test Environment & Mocks

-   **Backend**: `pytest` uses fixtures defined in `tests/conftest.py` to provide a test database session and a test client for making API requests.
-   **Frontend**: `Jest` uses the configuration in `tests/setup.js` to mock global browser objects like `fetch`, `localStorage`, and `WebSocket`, allowing components to be tested without a live browser or backend.
-   **E2E**: `Playwright` runs against a real browser instance (Chromium by default) and interacts with the application as a user would. The base URL and other parameters are configured in `playwright.config.js`.
