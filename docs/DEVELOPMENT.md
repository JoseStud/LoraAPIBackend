# LoRA Manager - Developer Notes

## Architecture Overview

This project follows a modern, decoupled architecture with a distinct backend API and a separate frontend application.

-   **Backend**: A self-contained FastAPI application located in the `backend/` directory. It handles all business logic, database interactions, and serves the API.
-   **Frontend**: A Vite-powered Vue 3 single-page application in `app/frontend/src/`. The historic Alpine.js compatibility layer has been removed; FastAPI now serves only the compiled SPA from `index.html`.
-   **Main Entrypoint**: The `app/main.py` file acts as a wrapper that serves the SPA shell and mounts the backend API under the versioned `/v1` path.

> **Status reminder:** The codebase is still evolving. Several integrations—most notably SDNext generation, queue processing, and the recommendation models—need additional setup or hardening before they are production ready. See the updated API contract and implementation status notes for the latest truth on what works end-to-end.【F:docs/contract.md†L1-L153】【F:docs/IMPLEMENTATION_COMPLETE.md†L1-L49】

---

## Project Structure

```
.
├── app/              # Main application wrapper and frontend
│   ├── frontend/
│   │   ├── src/      # Vue SPA source (components, composables, router, stores)
│   │   ├── static/   # Static assets (CSS input, icons)
│   │   ├── public/   # Static assets copied verbatim by Vite
│   │   ├── index.html  # SPA entrypoint served by FastAPI
│   │   └── utils/    # FastAPI helpers for serving built SPA assets
│   └── main.py       # Main FastAPI entrypoint to serve frontend & mount backend
│
├── backend/          # Self-contained backend FastAPI application
│   ├── api/          # API endpoint routers (v1, etc.)
│   ├── core/         # Core services (DB, config, security)
│   ├── models/       # SQLModel database models
│   ├── schemas/      # Pydantic schemas
│   ├── services/     # Business logic layer
│   └── main.py       # Backend FastAPI app factory
│
├── tests/            # Automated tests
│   ├── e2e/          # End-to-end tests (Playwright)
│   ├── integration/  # Integration tests (Pytest)
│   └── unit/         # Unit tests (Pytest for backend, Vitest for frontend)
│
├── infrastructure/   # Docker, Alembic, and deployment scripts
└── scripts/          # Helper scripts (e.g., importer.py)
```

---

## Key Modules & Technologies

### Backend (`backend/`)

-   **Framework**: FastAPI with SQLModel for ORM.
-   **API Routers (`backend/api/v1/`)**: Endpoints are organized by resource (e.g., `adapters.py`, `generation.py`). Public API routes are exposed under `/v1`.
-   **Services (`backend/services/`)**: The business logic is encapsulated in services (e.g., `AdapterService`, `GenerationService`) and injected into the API layer using FastAPI's dependency injection.
-   **Database (`backend/core/database.py`)**: Manages database sessions and initialization. Supports both SQLite and PostgreSQL.
-   **Background Jobs (`backend/workers/`)**: Uses Redis and RQ for handling long-running tasks like image generation or batch processing.

### Frontend (`app/frontend/`)

-   **Primary Router Workflows**:
    - `DashboardView` aggregates system metrics, queue telemetry, and quick actions.
    - `GenerateView` hosts the studio, live WebSocket status, and prompt tooling.
    - `AdminView` contains import/export, delivery configuration, and system health tools.
    - `LorasView` and `RecommendationsView` surface gallery discovery and similarity exploration.
-   **Build Tool**: Vite for fast development and optimized builds.
-   **Frameworks**: Vue 3 SPA orchestrated by Vue Router with Pinia for global state management.
-   **Styling**: Tailwind CSS compiled from `static/css/input.css` into the Vite bundle.
-   **Entrypoint (`src/main.ts`)**: Boots Vue Router, Pinia, and global styles for the application.
-   **Routing (`src/router/`)**: Defines Dashboard, Generate, Compose, History, LoRA management, and Admin views.
-   **Stores (`src/stores/`)**: Centralize queue telemetry, generation state, recommendations, and system status.
-   **Components (`src/components/`)**: Vue single-file components covering dashboard widgets, admin tools, and layout.
-   **Composables (`src/composables/`)**: Shared logic for API access, notifications, and system status polling.

---

## Development Workflow

### Prerequisites

-   Python 3.10+
-   Node.js 18+
-   Docker and Docker Compose

### Running the Application

A two-terminal setup is recommended for development:

**Terminal 1: Backend Server**

```bash
# Install Python dependencies
pip install -r requirements.txt

# Run the backend with auto-reload
uvicorn app.main:app --reload --port 8000
```

**Terminal 2: Frontend Development Server**

```bash
# Install Node.js dependencies
npm install

# Run the Vite dev server with Hot Module Replacement (HMR)
npm run dev
```

Access the application at `http://localhost:5173` (Vite dev server) or `http://localhost:8000` (FastAPI-served).

---

## Testing

The repository contains a large test suite, but many pieces require optional services or heavyweight tooling (Redis/RQ, an SDNext server, Playwright browsers, Lighthouse, GPU-enabled torch builds). Plan to run targeted subsets locally unless you have all dependencies available.

### Backend Testing (Pytest)

-   **Run all backend tests** (requires Redis/SDNext for queue coverage):
    ```bash
    pytest -v
    ```
-   **Focused suites**:
    ```bash
    pytest tests/test_services.py -v         # Core adapters & services
    pytest tests/test_generation_jobs.py -v  # SDNext queue helpers
    ```

### Frontend Testing (Vitest & Playwright)

-   **Unit tests**:
    ```bash
    npm run test:unit
    ```
-   **Browser-driven suites** (require Playwright browsers and credentials where applicable):
    ```bash
    npm run test:integration
    npm run test:e2e
    npm run test:performance  # Lighthouse CI
    ```

---

## Code Quality & Standards

-   **Linting**: `ruff` for Python and `eslint` for JavaScript. Run `ruff --fix .` and `npm run lint:fix` before committing.
-   **Type Hinting**: The Python codebase is fully type-hinted.
-   **Configuration**: All configuration is managed via environment variables (`.env` file) and loaded by Pydantic's `BaseSettings`. See `.env.example` for all available options.
-   **Database Migrations**: Alembic is used for schema migrations. To create a new migration, run `alembic revision --autogenerate -m "Your migration message"`.

## Open areas for follow-up

1. **Batch workflows** – A/B testing and bulk generation orchestration are still on the roadmap.
2. **Image management** – Thumbnails, metadata extraction, and cleanup policies need design and implementation.
3. **Analytics dashboard** – Usage metrics and performance monitoring require additional instrumentation beyond the current dashboard stats endpoints.【F:backend/api/v1/dashboard.py†L1-L40】

## Usage Examples

### Automated Importer
```bash
# Smart incremental updates
python scripts/importer.py --path /data/loras

# Full re-ingestion
python scripts/importer.py --path /data/loras --force-resync

# Preview changes
python scripts/importer.py --path /data/loras --dry-run
```

### Database Migrations
```bash
# Apply all migrations (from infrastructure/alembic/)
PYTHONPATH=$(pwd) alembic -c infrastructure/alembic/alembic.ini upgrade head

# For PostgreSQL
DATABASE_URL=postgresql://user:pass@host/db alembic -c infrastructure/alembic/alembic.ini upgrade head
```
