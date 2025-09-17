# LoRA Manager - Developer Notes

## Architecture Overview

This project follows a modern, decoupled architecture with a distinct backend API and a separate frontend application.

-   **Backend**: A self-contained FastAPI application located in the `backend/` directory. It handles all business logic, database interactions, and serves the API.
-   **Frontend**: A Vite-powered single-page application located in `app/frontend/`. It's built with Alpine.js and Tailwind CSS.
-   **Main Entrypoint**: The `app/main.py` file acts as a wrapper that serves the frontend and mounts the backend API under the versioned `/v1` path.

---

## Project Structure

```
.
├── app/              # Main application wrapper and frontend
│   ├── frontend/     # All frontend assets (served by Vite/FastAPI)
│   │   ├── static/
│   │   │   ├── js/
│   │   │   │   ├── components/ # Modular Alpine.js components
│   │   │   │   ├── services/   # API communication
│   │   │   │   └── utils/      # Shared utilities
│   │   │   └── css/
│   │   └── templates/      # Jinja2 HTML templates
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
│   └── unit/         # Unit tests (Pytest for backend, Jest for frontend)
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

-   **Build Tool**: Vite for fast development and optimized builds.
-   **Framework**: Alpine.js for reactive, component-based UI.
-   **Styling**: Tailwind CSS for utility-first styling.
-   **Entrypoint (`static/js/main.js`)**: The single entry point for all JavaScript, which imports all necessary components and utilities.
-   **Components (`static/js/components/`)**: The UI is broken down into reusable Alpine.js components (e.g., `lora-gallery`, `generation-studio`).
-   **API Service (`static/js/services/api-service.js`)**: A centralized service for making all HTTP requests to the backend.

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

The project has a comprehensive testing suite.

### Backend Testing (Pytest)

-   **Run all backend tests:**
    ```bash
    pytest
    ```
-   Tests are located in `tests/integration` and `tests/unit`. They use an in-memory SQLite database and mock external services.

### Frontend Testing (Jest & Playwright)

-   **Run all frontend tests:**
    ```bash
    npm test
    ```
-   **Unit Tests (`tests/unit/js/`)**: Use Jest to test individual Alpine.js components.
-   **End-to-End Tests (`tests/e2e/`)**: Use Playwright to simulate user interactions in a real browser.

---

## Code Quality & Standards

-   **Linting**: `ruff` for Python and `eslint` for JavaScript. Run `ruff --fix .` and `npm run lint:fix` before committing.
-   **Type Hinting**: The Python codebase is fully type-hinted.
-   **Configuration**: All configuration is managed via environment variables (`.env` file) and loaded by Pydantic's `BaseSettings`. See `.env.example` for all available options.
-   **Database Migrations**: Alembic is used for schema migrations. To create a new migration, run `alembic revision --autogenerate -m "Your migration message"`.
8. **Batch workflows**: A/B testing and bulk generation capabilities
9. **Image management**: Thumbnails, metadata extraction, automatic cleanup
10. **Analytics dashboard**: Usage metrics and performance monitoring

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
