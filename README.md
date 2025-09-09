# LoRA Manager

A comprehensive FastAPI-based backend with modern Vite frontend for managing LoRA adapters with AI-powered recommendations, real-time generation monitoring, and multi-backend delivery support.

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

## ✨ Key Features

- ✅ **AI-Powered Recommendations** - Semantic similarity and prompt-based LoRA discovery
- ✅ **Real-time Generation** - WebSocket progress monitoring for image generation
- ✅ **Multi-Backend Support** - HTTP, CLI, and SDNext delivery modes
- ✅ **GPU Acceleration** - AMD ROCm and NVIDIA CUDA support
- ✅ **Comprehensive API** - 28+ endpoints with full CRUD operations
- ✅ **Background Processing** - Redis/RQ for async operations
- ✅ **Modern Frontend** - Vite + Alpine.js + Tailwind CSS with component architecture
- ✅ **Progressive Web App** - Offline capabilities and mobile-optimized interface

## 🏗️ Architecture

The project uses a dual-architecture approach with clear separation between frontend and backend:

### Backend API (FastAPI)
```
backend/
├── api/v1/        # FastAPI endpoints (adapters, compose, generation, etc.)
├── core/          # Configuration, database, dependencies, security
├── models/        # SQLModel database models
├── schemas/       # Pydantic request/response schemas
├── services/      # Business logic layer (recommendations, generation, etc.)
├── delivery/      # Pluggable delivery backends (HTTP, CLI, SDNext)
└── workers/       # Background task processing
```

### Frontend Application (Vite + Alpine.js)
```
app/frontend/
├── static/
│   ├── js/
│   │   ├── components/    # Modular Alpine.js components
│   │   │   ├── system-admin/     # Admin interface components
│   │   │   ├── generation-studio/ # Generation workflow
│   │   │   ├── performance-analytics/ # Analytics dashboard
│   │   │   ├── import-export/    # Data management
│   │   │   └── [other modules]/  # Feature-specific components
│   │   ├── core/         # Component loading and registration
│   │   ├── services/     # API communication layer
│   │   └── utils/        # Shared utilities
│   ├── css/              # Tailwind CSS and custom styles
│   └── images/           # Static assets
├── templates/            # Jinja2 templates
└── routes/              # Frontend routing logic
```

### Frontend Technology Stack

- **Vite** - Modern build tool with hot module replacement
- **Alpine.js** - Lightweight reactive framework for component behavior
- **Tailwind CSS** - Utility-first CSS framework
- **HTMX** - Dynamic HTML exchanges for seamless updates
- **Jinja2** - Server-side templating
- **PWA** - Progressive Web App with offline support and mobile optimization

## 🧪 Testing

### Backend Tests (Python)
```bash
# Run all Python tests
pytest -v

# Run specific test suites
pytest tests/test_recommendations.py -v  # AI recommendations (13/13 passing)
pytest tests/test_services.py -v         # Core services
pytest tests/test_main.py -v            # API endpoints
```

### Frontend Tests (JavaScript)
```bash
# Run all frontend tests
npm test

# Run specific test types
npm run test:unit          # Jest unit tests for components
npm run test:integration   # API integration tests
npm run test:e2e          # Playwright end-to-end tests
npm run test:performance  # Lighthouse performance audits

# Development testing
npm run test:watch        # Watch mode for development
npm run test:coverage     # Generate coverage reports
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

**Production Ready** - All core features implemented with comprehensive test coverage (28/28 tests passing).

See [IMPLEMENTATION_COMPLETE.md](docs/IMPLEMENTATION_COMPLETE.md) for detailed feature status and [contract.md](docs/contract.md) for complete API documentation.
