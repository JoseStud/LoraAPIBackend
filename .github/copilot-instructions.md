
# LoRA Manager - LoRA Model Management System with AI Recommendations

Always follow these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the information provided here.

## Working Effectively

### Bootstrap, Build, and Test the Repository

1. Install Python dependencies:
   ```bash
   pip3 install -r requirements.txt
   ```
   Takes approximately 30 seconds. No timeout needed.

2. Install development dependencies:
   ```bash
   pip3 install -r dev-requirements.txt
   ```
   Takes approximately 15 seconds. No timeout needed.

3. Install Node.js dependencies (SPECIAL NOTE - Puppeteer fails due to network restrictions):
   ```bash
   PUPPETEER_SKIP_DOWNLOAD=true npm install
   ```
   Takes approximately 8 seconds. NEVER use `npm install` without `PUPPETEER_SKIP_DOWNLOAD=true` - it will fail due to firewall limitations.

4. Build frontend assets:
   ```bash
   npm run build
   ```
   Takes approximately 3 seconds. No timeout needed.

5. Build CSS assets:
   ```bash
   npm run build:css
   ```
   Takes approximately 2 seconds. No timeout needed.

### Run and Test the Application

- **Backend only** (serves frontend from dist/):
  ```bash
  uvicorn app.main:app --reload --port 8000
  ```
  Starts in 2-3 seconds. Access at http://localhost:8000

- **Full development setup** (backend + frontend dev server):
  ```bash
  npm run dev:full
  ```
  Starts both backend (port 8000) and frontend dev server (port 5173) concurrently. Ready in 5-10 seconds.

- **Backend only for development**:
  ```bash
  npm run dev:backend
  ```

- **Frontend dev server only**:
  ```bash
  npm run dev
  ```

### Testing

- **Python tests** (core functionality):
  ```bash
  pytest tests/test_main.py tests/test_services.py tests/test_recommendations.py -v
  ```
  Takes approximately 2-3 seconds. NEVER CANCEL. Some tests may fail due to missing ML dependencies (torch, sentence-transformers) - this is expected in basic environments.

- **Vue component & integration tests** (always work):
  ```bash
  npm run test:unit
  ```
  Takes approximately 3 seconds. NEVER CANCEL. Set timeout to 10+ seconds.

- **API helper smoke tests**:
  ```bash
  npm run test:integration
  ```
  Takes approximately 5 seconds. NEVER CANCEL. Set timeout to 15+ seconds.

### Code Quality

- **JavaScript linting**:
  ```bash
  npm run lint
  ```
  Takes approximately 2 seconds. Shows many warnings and one error - this is expected.

- **JavaScript lint fixing**:
  ```bash
  npm run lint:fix
  ```

- **Python linting**:
  ```bash
  ruff check .
  ```
  Takes less than 1 second. Shows many docstring style warnings - this is expected.

- **Pre-commit validation**:
  ```bash
  npm run validate
  ```
  Runs linting + tests. Takes approximately 15 seconds. NEVER CANCEL. Set timeout to 30+ seconds.

## Validation

- **ALWAYS** manually test the application after making changes by running `npm run dev:full` and accessing http://localhost:8000
- **ALWAYS** test the API health endpoint: `curl http://localhost:8000/api/health` should return `{"status":"ok"}`
- **ALWAYS** run Python tests with `pytest tests/test_main.py tests/test_services.py -v` before committing
- **ALWAYS** run Vue tests with `npm run test:unit` before committing
- **CRITICAL HTMX FIX**: If you encounter HTMX import errors in Vite build, use `import 'htmx.org';` NOT `import htmx from 'htmx.org';`

## Architecture Understanding

### Project Structure
```
.
├── app/              # Main application wrapper and frontend
│   ├── frontend/     # Vite + Alpine.js + Tailwind CSS frontend
│   │   ├── static/   # JS components, CSS, images
│   │   └── templates/ # Jinja2 HTML templates
│   └── main.py       # FastAPI wrapper that serves frontend + mounts backend
├── backend/          # Self-contained FastAPI backend API
│   ├── api/v1/       # API endpoints (adapters, generation, etc.)
│   ├── core/         # Database, config, security
│   ├── models/       # SQLModel database models
│   ├── schemas/      # Pydantic request/response schemas
│   ├── services/     # Business logic (recommendations, generation)
│   └── delivery/     # Pluggable backends (HTTP, CLI, SDNext)
├── tests/            # Comprehensive test suite
└── infrastructure/   # Docker deployment configurations
```

### Technology Stack
- **Backend**: FastAPI + SQLModel + PostgreSQL/SQLite + Redis/RQ
- **Frontend**: Vite + Alpine.js + Tailwind CSS + HTMX
- **Testing**: Pytest (Python) + Jest/Vitest (JavaScript) + Playwright (E2E)
- **Deployment**: Docker + Docker Compose with GPU support

### Key Features
- AI-powered LoRA recommendations using semantic similarity
- Real-time generation monitoring via WebSockets
- Multi-backend delivery (HTTP, CLI, SDNext integration)
- Progressive Web App with offline capabilities
- Comprehensive API with 28+ endpoints

## Common Issues and Solutions

### Build Issues
- **HTMX Import Error**: Use `import 'htmx.org';` not `import htmx from 'htmx.org';`
- **Puppeteer Installation**: Always use `PUPPETEER_SKIP_DOWNLOAD=true npm install`
- **Missing ML Dependencies**: Tests may fail without torch/sentence-transformers - this is expected

### Development Workflow
- Use `npm run dev:full` for active development with hot reload
- Access frontend at http://localhost:5173 (dev server) or http://localhost:8000 (production build)
- API documentation available at http://localhost:8000/docs
- WebSocket connections available at ws://localhost:8000/ws

### Testing Strategy
- Python tests cover backend API and business logic
- Vue tests cover component functionality
- Jest tests have known parsing issues but import-export tests work
- Always test both Python and Vue test suites before committing

### Code Quality Standards
- Python: Ruff linting (many docstring warnings expected)
- JavaScript: ESLint (many console.log warnings expected)
- Use `npm run validate` to run complete quality checks

## Important File Locations

### Configuration Files
- `package.json` - Frontend dependencies and scripts
- `requirements.txt` - Python dependencies
- `dev-requirements.txt` - Python development tools
- `pyproject.toml` - Python project configuration
- `vite.config.js` - Frontend build configuration
- `tailwind.config.js` - CSS framework configuration

### Entry Points
- `app/main.py` - Main application server
- `backend/main.py` - Backend API only
- `app/frontend/static/js/main.js` - Frontend JavaScript entry point

### Critical Components
- `backend/services/` - Core business logic
- `app/frontend/static/js/components/` - Frontend components
- `backend/api/v1/` - API endpoint definitions
- `tests/` - All test files

Always check `README.md` for the latest setup instructions and `docs/DEVELOPMENT.md` for detailed architecture information.

