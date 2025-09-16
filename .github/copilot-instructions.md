# LoRA Manager - GitHub Copilot Instructions

**ALWAYS** follow these instructions first and fallback to additional search and context gathering ONLY if the information in these instructions is incomplete or found to be in error.

## Project Overview

LoRA Manager is a FastAPI-based backend with modern Vite frontend for managing LoRA adapters with AI-powered recommendations, real-time generation monitoring, and multi-backend delivery support. The project uses a modular architecture with clear separation between backend API (`backend/`) and frontend application (`app/frontend/`).

## Bootstrap and Setup Commands

**Run these commands in exact order to set up the development environment:**

1. **Install Python dependencies** (takes ~1 minute):
   ```bash
   pip install -r requirements.txt
   ```

2. **Install Node.js dependencies** (takes ~7 seconds):
   ```bash
   PUPPETEER_SKIP_DOWNLOAD=true npm install
   ```
   Note: PUPPETEER_SKIP_DOWNLOAD=true is required in sandboxed environments where Chrome download fails.

3. **Build frontend assets** (takes ~4 seconds total):
   ```bash
   npm run build:css  # Tailwind CSS compilation (~1.6s)
   npm run build      # Vite production build (~2.4s)
   ```

## Development Workflow

### Two-Terminal Development Setup (Recommended)

**Terminal 1: Backend Server**
```bash
uvicorn app.main:app --reload --port 8000
```
- Backend API available at: `http://localhost:8000`
- API Documentation at: `http://localhost:8000/api/docs`
- Health check: `curl http://localhost:8000/health`

**Terminal 2: Frontend Development Server**
```bash
npm run dev
```
- Frontend dev server at: `http://localhost:5173`
- Hot module replacement enabled
- Proxies API requests to backend

### Alternative Development Commands

```bash
# Run both backend and frontend simultaneously
npm run dev:full

# Backend only (serves frontend from dist/)
npm run build && npm run dev:backend

# CSS development (Tailwind watch mode)
npm run dev:css
```

## Testing

### Python Tests

```bash
# Install test dependencies first (takes ~30s)
pip install -r dev-requirements.txt
pip install pytest-asyncio

# Run working tests (takes ~2s, timeout: 2 minutes)
pytest tests/test_services.py tests/test_main.py -v

# Run recommendation tests (requires ML dependencies, may fail without torch/transformers)
pytest tests/test_recommendations.py -v
```

**Note:** Some tests require optional ML dependencies (torch, sentence-transformers) that are not installed by default. Test failures related to missing ML libraries are expected in basic setup.

### JavaScript Tests

```bash
# Run unit tests (takes ~9s, timeout: 2 minutes)
npm run test:unit

# Run individual test suites
npm run test:integration  # API integration tests  
npm run test:e2e         # Playwright end-to-end tests (may fail without browser)
```

**Expected:** Some JavaScript tests may fail due to syntax parsing issues or missing browser dependencies in sandboxed environments. Core functionality tests should pass.

## Code Quality and Linting

### JavaScript Linting
```bash
# Run linting (takes ~1.5s, timeout: 2 minutes)
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Validate linting + tests
npm run validate
```

### Python Linting
```bash
# Run ruff linting with auto-fix (takes ~0.1s, timeout: 2 minutes)
ruff check --fix

# Note: Expect docstring formatting warnings - these don't affect functionality
```

## Build and Production

### Production Build
```bash
# NEVER CANCEL: Build takes up to 5 minutes total. Set timeout to 10+ minutes.
npm run build:css  # 1-2 seconds
npm run build      # 2-3 seconds

# Production server
ENVIRONMENT=production uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Docker Deployment Options

```bash
cd infrastructure/docker

# Auto-detect hardware (recommended for development)
docker-compose up -d

# NVIDIA GPU (production)
docker-compose -f docker-compose.gpu.yml up -d

# AMD ROCm GPU  
docker-compose -f docker-compose.rocm.yml up -d

# CPU only
docker-compose -f docker-compose.cpu.yml up -d
```

**Docker Services:**
- LoRA Manager API: `http://localhost:8782`
- SDNext WebUI: `http://localhost:7860`
- PostgreSQL: `localhost:5433`
- Redis: `localhost:6380`

## Critical Timing and Timeout Information

**NEVER CANCEL these commands - they WILL complete:**

- `pip install -r requirements.txt`: 1 minute (timeout: 5 minutes)
- `npm install`: 7 seconds (timeout: 3 minutes)  
- `npm run build`: 3 seconds (timeout: 2 minutes)
- `pytest`: 2 seconds (timeout: 2 minutes)
- `npm test`: 9 seconds (timeout: 3 minutes)
- `docker-compose up`: 2-5 minutes (timeout: 10 minutes)

## Validation Scenarios

**Always test these scenarios after making changes:**

### Backend API Validation
```bash
# 1. Start backend
uvicorn app.main:app --reload --port 8000

# 2. Test health endpoint
curl http://localhost:8000/health
# Expected: {"status":"healthy","service":"lora-manager"}

# 3. Test API documentation
curl http://localhost:8000/api/docs
# Expected: HTML page with Swagger UI
```

### Frontend Validation  
```bash
# 1. Build frontend assets
npm run build

# 2. Start development server
npm run dev

# 3. Test frontend endpoint  
curl http://localhost:5173/
# Expected: HTML content or successful response
```

### Full Application Validation
```bash
# 1. Start both services
npm run dev:full

# 2. Verify both endpoints respond
curl http://localhost:8000/health && curl http://localhost:5173/

# 3. Test API through frontend proxy
curl http://localhost:5173/api/docs
```

## Directory Structure

```
.
├── app/              # Main application wrapper and frontend
│   ├── frontend/     # Frontend assets (Vite + Alpine.js + Tailwind)
│   └── main.py       # FastAPI wrapper mounting backend at /api
├── backend/          # Self-contained FastAPI backend
│   ├── api/v1/       # API endpoints
│   ├── core/         # Configuration, database, dependencies
│   ├── models/       # SQLModel database models
│   ├── schemas/      # Pydantic schemas
│   └── services/     # Business logic
├── tests/            # Test suites (Python pytest, JavaScript jest)
├── infrastructure/   # Docker, Alembic migrations
└── scripts/          # Utility scripts
```

## Common Issues and Solutions

### Node.js Installation Fails
```bash
# Use this exact command to skip Puppeteer download:
PUPPETEER_SKIP_DOWNLOAD=true npm install
```

### Build Fails on HTMX Import
- Fixed: Import HTMX as `import 'htmx.org';` (not default import)

### Python Tests Fail on ML Dependencies
- Expected: Tests requiring torch/transformers will fail without ML dependencies
- Core API and service tests should pass

### Docker Fails to Start
```bash
# Check system requirements and run health check:
cd infrastructure/docker
./health-check.sh
```

## API Endpoints Summary

The backend API is mounted at `/api` with key endpoints:
- `GET /health` - Health check
- `GET /api/docs` - API documentation  
- `GET /api/v1/adapters` - List LoRA adapters
- `POST /api/v1/generation/enqueue` - Start image generation
- `GET /api/v1/recommendations/for-prompt/{prompt}` - Get AI recommendations

## Environment Variables

**Development:**
- `DATABASE_URL`: SQLite by default (`sqlite:///./db.sqlite`)
- `REDIS_URL`: Optional for background jobs
- `BACKEND_URL`: `http://localhost:8000` (for frontend proxy)

**Production:**
- `ENVIRONMENT=production`
- `DATABASE_URL`: PostgreSQL connection string
- `SDNEXT_BASE_URL`: Stable Diffusion backend URL

## Final Notes

- Backend serves at port 8000, frontend dev server at 5173
- All builds complete in under 5 seconds in normal environments
- Test suites are comprehensive but may have expected failures for optional dependencies
- Docker deployment supports CPU, NVIDIA GPU, and AMD ROCm configurations
- Always run linting before committing: `npm run lint && ruff check --fix`
