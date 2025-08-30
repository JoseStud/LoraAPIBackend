# LoRA Manager Backend

A comprehensive FastAPI-based backend for managing LoRA adapters with AI-powered recommendations, real-time generation monitoring, and multi-backend delivery support.

## 🚀 Quick Start

```bash
# Install dependencies with AMD GPU support
pip install -r requirements-amd.txt

# Run development server
uvicorn app.main:app --reload --port 8000

# Check system health
./scripts/check_health.sh
```

## 📚 Documentation

- **[API Contract](docs/contract.md)** - Complete API specification with all endpoints
- **[Development Guide](docs/DEVELOPMENT.md)** - Architecture, modules, and development notes
- **[Frontend Plan](docs/FRONTEND_PLAN.md)** - Comprehensive frontend implementation guide
- **[Implementation Status](docs/IMPLEMENTATION_COMPLETE.md)** - Feature completion tracking
- **[GPU Setup](docs/ROCM_TROUBLESHOOTING.md)** - AMD ROCm GPU acceleration setup

## ✨ Key Features

- ✅ **AI-Powered Recommendations** - Semantic similarity and prompt-based LoRA discovery
- ✅ **Real-time Generation** - WebSocket progress monitoring for image generation
- ✅ **Multi-Backend Support** - HTTP, CLI, and SDNext delivery modes
- ✅ **GPU Acceleration** - AMD ROCm and NVIDIA CUDA support
- ✅ **Comprehensive API** - 28+ endpoints with full CRUD operations
- ✅ **Background Processing** - Redis/RQ for async operations

## 🏗️ Architecture

```
app/
├── core/          # Configuration, database, dependencies
├── models/        # SQLModel database models
├── schemas/       # Pydantic request/response schemas
├── api/v1/        # FastAPI endpoints
├── services/      # Business logic layer
├── delivery/      # Pluggable delivery backends
└── workers/       # Background task processing
```

## 🧪 Testing

```bash
# Run all tests
pytest -v

# Run specific test suites
pytest tests/test_recommendations.py -v  # AI recommendations (13/13 passing)
pytest tests/test_services.py -v         # Core services
pytest tests/test_main.py -v            # API endpoints
```

## 🔧 Configuration

Key environment variables:
- `DATABASE_URL` - Database connection string
- `REDIS_URL` - Redis connection for background jobs
- `API_KEY` - Optional API authentication
- `LOG_LEVEL` - Logging verbosity

## 📦 Deployment

```bash
# Development setup
./infrastructure/scripts/setup_custom.sh

# Docker deployment
docker-compose -f infrastructure/docker/docker-compose.yml up

# Production with GPU support
docker-compose -f infrastructure/docker/docker-compose.gpu.yml up
```

## 🎯 Status

**Production Ready** - All core features implemented with comprehensive test coverage (28/28 tests passing).

See [IMPLEMENTATION_COMPLETE.md](docs/IMPLEMENTATION_COMPLETE.md) for detailed feature status and [contract.md](docs/contract.md) for complete API documentation.
