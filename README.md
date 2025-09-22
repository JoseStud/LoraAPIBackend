# LoRA Manager

An in-progress FastAPI backend with a Vite-powered Vue frontend for managing LoRA adapters, composing prompts, and experimenting with SDNext-powered image generation. The project already exposes usable APIs, but several features (especially recommendations and long-running queue processing) still require manual setup or additional development before they are production ready.

## 🚀 Quick Start

### Development (Two-Terminal Setup)

**Terminal 1: Backend Server**
```bash
# Install Python dependencies with AMD GPU support
pip install -r requirements-amd.txt

# Run development server
uvicorn app.main:app --reload --port 8000
```

**Terminal 2: Frontend Development Server**
```bash
# Install Node.js dependencies
npm install

# Run Vite development server with hot reload
npm run dev
```

Visit `http://localhost:8000` to access the application.

### Alternative Development Workflow
```bash
# Option 1: Run both backend and frontend simultaneously
npm run dev:full

# Option 2: Backend only (serves frontend from dist/)
npm run build  # Build frontend assets first
npm run dev:backend

# Option 3: CSS development (Tailwind watch mode)
npm run dev:css
```

### Production
```bash
# Build frontend assets
npm run build

# Run in production mode
ENVIRONMENT=production uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 📚 Documentation

- **[API Contract](docs/contract.md)** - Complete API specification with all endpoints
- **[Development Guide](docs/DEVELOPMENT.md)** - Architecture, modules, and development notes
- **[Implementation Status](docs/IMPLEMENTATION_COMPLETE.md)** - Feature completion tracking
- **[Custom Setup](docs/CUSTOM_SETUP.md)** - Environment-specific setup guide
- **[GPU Setup](docs/ROCM_TROUBLESHOOTING.md)** - AMD ROCm GPU acceleration setup
- **[PostgreSQL Setup](docs/POSTGRES_SETUP.md)** - Database configuration guide
- **[WebSocket Implementation](docs/WEBSOCKET_IMPLEMENTATION.md)** - Real-time features documentation
- **[Release Notes](docs/RELEASE_NOTES.md)** - Highlights of recent platform updates

## ✨ Current highlights

- **Adapter management API** – CRUD endpoints for LoRA metadata, tag search, and activation workflows are implemented in the backend service layer.【F:backend/api/v1/adapters.py†L1-L187】
- **Prompt composition & delivery queue** – Active adapters can be composed into prompts and optionally scheduled as delivery jobs using the shared queue helpers.【F:backend/api/v1/compose.py†L1-L45】【F:backend/services/deliveries.py†L16-L205】
- **SDNext integration (experimental)** – Generation endpoints talk to an external SDNext server and reuse the delivery infrastructure for deferred jobs. The feature works but still requires manual SDNext setup and a running queue worker for long jobs.【F:backend/api/v1/generation.py†L1-L373】【F:backend/delivery/sdnext.py†L1-L205】
- **Recommendation service (optional)** – Recommendation routes are wired to the service layer, but they expect torch/embedding models to be present; environments without those dependencies will see runtime errors.【F:backend/api/v1/recommendations.py†L1-L119】【F:backend/services/recommendations/service.py†L33-L153】
- **Vue 3 frontend** – The Vite-built SPA lives under `app/frontend` and consumes the API for dashboard metrics, generation controls, and adapter management flows.【F:app/frontend/src/main.ts†L1-L20】【F:app/frontend/src/router/index.ts†L1-L120】

## 🧭 Vue SPA Workflows

- **Dashboard** – Consolidated system status, queue metrics, and quick actions delivered via the `DashboardView` router view.
- **Generate** – Full-screen generation studio with live WebSocket telemetry, prompt tooling, and recommendation feed.
- **Admin & System** – Administrative controls, import/export consoles, and health monitoring packaged under the Admin route.
- **LoRA Management** – Gallery browsing, similarity recommendations, and history insights surfaced through dedicated Vue views.

## 🏗️ Architecture

The project uses a modular architecture with a clear separation between the backend API and the frontend application.

### Project Root
```
.
├── app/              # Main application: FastAPI wrapper and frontend assets
│   ├── frontend/
│   │   ├── src/      # Vue 3 SPA source (components, composables, router)
│   │   ├── static/   # Tailwind input CSS, icons, service worker
│   │   ├── public/   # Static assets copied verbatim by Vite
│   │   └── index.html  # SPA entrypoint served by FastAPI
│   └── main.py       # Main FastAPI app entry point
├── backend/          # Backend API (self-contained FastAPI app)
│   ├── api/          # API endpoint routers
│   ├── core/         # Core services (DB, config, security)
│   ├── models/       # SQLModel database models
│   ├── schemas/      # Pydantic schemas
│   ├── services/     # Business logic
│   └── main.py       # Backend FastAPI app entry point
├── tests/            # Unit, integration, and E2E tests
└── package.json      # Frontend dependencies and scripts
```

### Backend API (`backend/`)

The backend is a self-contained FastAPI application mounted at `/api`.

```
backend/
├── api/v1/        # API endpoints (adapters, compose, generation, etc.)
├── core/          # Configuration, database, dependencies, security
├── models/        # SQLModel database models
├── schemas/       # Pydantic request/response schemas
├── services/      # Business logic layer (recommendations, generation, etc.)
├── delivery/      # Pluggable delivery backends (HTTP, CLI, SDNext)
└── workers/       # Background task processing
```

### Frontend Application (`app/frontend/`)

The frontend now centers on a Vue 3 single-page application compiled by Vite. FastAPI serves the SPA shell (`index.html`) while the Vue source lives in `src/`. Legacy Alpine.js modules have been removed along with the historical `templates/` directory.

```
app/frontend/
├── src/               # Vue SPA source (components, composables, router, stores)
├── static/
│   ├── css/           # Tailwind input styles processed by Vite
│   ├── images/        # Icons and share images bundled with the PWA
│   ├── manifest.json  # PWA manifest consumed by Vite build
│   └── sw.js          # Service worker registered by the SPA shell
├── public/            # Static assets copied verbatim during build
├── index.html         # SPA entrypoint served by FastAPI
└── utils/             # FastAPI helpers for serving built SPA assets
```

### Frontend Technology Stack

- **Vue 3 + Pinia** - Primary SPA framework and state management
- **Vite** - Modern build tool with hot module replacement
- **Tailwind CSS** - Utility-first styling compiled from `static/css/input.css` into the Vite bundle
- **Vue SPA Only** - Alpine.js bundles have been removed; Vue components own every workflow
- **Vue Router + Pinia Tooling** - Router views coordinate navigation while Pinia stores centralize queue, admin, and generation state
- **PWA** - Progressive Web App with offline support and mobile optimization

## 🧪 Testing

The repository contains extensive test scaffolding, but many suites depend on optional services (Redis, SDNext, Playwright browsers, Lighthouse) or large ML models. Use targeted commands when developing locally and expect to configure additional tooling before everything passes.

### Backend Tests (Python)
```bash
# Run all Python tests (requires optional services for queue & SDNext flows)
pytest -v

# Focused suites
pytest tests/test_services.py -v         # Core services and adapters
pytest tests/test_generation_jobs.py -v  # SDNext queue helpers (needs SDNext/Redis)
```

### Frontend Tests (JavaScript)
```bash
# Run Vitest unit tests
npm run test:unit

# Integration & browser-driven suites (require Playwright deps)
npm run test:integration
npm run test:e2e

# Optional tooling
npm run test:performance  # Lighthouse (needs Chrome & credentials)
npm run test:coverage     # Vitest coverage + Coveralls upload
```

### Code Quality
```bash
# Linting and formatting
npm run lint              # ESLint code analysis  
npm run lint:fix          # Auto-fix linting issues
npm run validate          # Run linting + tests

# Python code quality
pytest --cov             # Python test coverage
```

## 🔧 Configuration

### Backend Environment Variables
- `DATABASE_URL` - Database connection string (defaults to SQLite)
- `REDIS_URL` - Redis connection for background jobs (optional)
- `API_KEY` - Optional API authentication
- `IMPORT_PATH` - Directory to scan for LoRA files (default: `/app/loras`)
- `IMPORT_POLL_SECONDS` - Importer polling interval (default: 10)

### SDNext Integration
- `SDNEXT_BASE_URL` - SDNext server URL (e.g., `http://localhost:7860`)
- `SDNEXT_USERNAME` / `SDNEXT_PASSWORD` - Authentication for protected instances
- `SDNEXT_TIMEOUT` - Request timeout in seconds (default: 120)
- `SDNEXT_POLL_INTERVAL` - Progress polling interval (default: 2)

### Frontend Configuration
- `BACKEND_URL` - Backend API base URL (default: `http://localhost:8000`)
- `REQUEST_TIMEOUT` - Frontend request timeout (default: 30.0)
- `ENVIRONMENT` - Application environment (`development`, `production`)

## 📦 Deployment

### Quick Start
```bash
# Development setup with custom environment
./infrastructure/scripts/setup_custom.sh

# Docker deployment (choose your configuration)
cd infrastructure/docker

# Auto-detect (recommended for development)
docker-compose up

# NVIDIA GPU (recommended for production)
docker-compose -f docker-compose.gpu.yml up

# AMD GPU (ROCm)
docker-compose -f docker-compose.rocm.yml up

# CPU only
docker-compose -f docker-compose.cpu.yml up
```

### Health Check
```bash
# Check all services are running correctly
cd infrastructure/docker
./health-check.sh
```

### Access Points
- **LoRA Manager API**: http://localhost:8782
- **API Documentation**: http://localhost:8782/docs  
- **SDNext WebUI**: http://localhost:7860
- **Database**: localhost:5433 (postgres/postgres)

See [Docker Setup Guide](infrastructure/docker/README.md) for comprehensive deployment documentation.

## 🎯 Status

**Work in progress** – The backend and frontend are usable today, but the SDNext integration, recommendation flows, and long-running queue processing still need additional hardening and documentation before they can be called production ready. Review the updated implementation status note and API contract for details on what currently works and where the gaps remain.【F:docs/IMPLEMENTATION_COMPLETE.md†L1-L49】【F:docs/contract.md†L1-L153】
