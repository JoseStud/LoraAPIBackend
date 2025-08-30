# LoRA Manager Backend - Developer Notes

## Goal

Provide context for maintainers and contributors on the implementation, modules, and recommended next steps for production-hardening.

## Architecture Overview

- **FastAPI** app with modular routers for adapters, compose, deliveries, and generation
- **SQLModel + SQLite** for comprehensive Adapter metadata (25+ Civitai fields) and DeliveryJob records
- **Modular service architecture** with dependency injection for maintainability and testing
- **Plugin-based delivery system** supporting HTTP, CLI, and SDNext backends
- **Redis + RQ** for background job processing
- **WebSocket support** for real-time progress monitoring

## Key Modules

### Core Application (`app/`)
- `app/main.py` - FastAPI application setup and router inclusion
- `app/core/` - Core application infrastructure:
  - `config.py` - Application configuration management
  - `database.py` - Database engine and session management  
  - `dependencies.py` - Dependency injection container
  - `security.py` - Optional API key authentication
  - `logging.py` - Structured logging configuration

### Data Layer
- `app/models/` - SQLModel database models:
  - `adapters.py` - LoRA metadata models (25+ Civitai fields)
  - `deliveries.py` - DeliveryJob and related models
  - `base.py` - Shared model configurations
- `app/schemas/` - Pydantic request/response models:
  - `adapters.py` - LoRA management schemas
  - `deliveries.py` - Job management schemas
  - `generation.py` - Image generation schemas
  - `common.py` - Shared schema components

### API Layer
- `app/api/v1/` - Versioned API endpoints:
  - `adapters.py` - LoRA management endpoints
  - `compose.py` - Prompt composition
  - `deliveries.py` - Job management
  - `generation.py` - Image generation (6 endpoints)
  - `websocket.py` - Real-time progress updates

### Business Logic
- `app/services/` - Service layer with dependency injection:
  - `adapters.py` - LoRA metadata management
  - `deliveries.py` - Job orchestration
  - `composition.py` - LoRA token formatting
  - `generation.py` - SDNext API integration
  - `storage.py` - File storage abstraction
  - `websocket.py` - Real-time progress monitoring

### Delivery Backends
- `app/delivery/` - Plugin-based delivery system:
  - `base.py` - Abstract interfaces
  - `http.py`, `cli.py`, `sdnext.py` - Implementation backends

### Background Processing
- `app/workers/` - Background job processing:
  - `tasks.py` - Background worker processing
  - `worker.py` - Worker configuration and setup

### Infrastructure
- `infrastructure/alembic/` - Database migrations with Alembic
- `scripts/importer.py` - Automated Civitai metadata ingestion with smart resync


## Development Standards

### Linting
- **ruff** as primary linter (line length: 88 chars, Python 3.10+)
- Docstring checks enabled with exceptions for D203/D213 conflicts
- Run `ruff --fix` before committing

### Key Design Decisions
- **Comprehensive metadata**: 25+ Civitai fields for rich querying
- **Smart resync**: File modification tracking for efficient updates
- **JSON storage**: SQLite JSON columns (migrate to JSONB for PostgreSQL)
- **Timezone handling**: Currently naive DateTime (needs migration)
- **Background processing**: Redis/RQ for long-running tasks


## Implemented Features

### ✅ Core Infrastructure
- **Modular service architecture** with dependency injection
- **Plugin-based delivery system** (HTTP, CLI, SDNext backends)
- **Comprehensive test coverage** (28/28 tests passing across all modules)
- **Database migrations** with Alembic
- **API contract hardening** with explicit response models
- **Structured logging** with optional API key authentication
- **Performance indexes** for critical query paths (active adapters, job status filtering)

### ✅ LoRA Management
- **Automated importer** with smart resync capabilities
- **25+ Civitai metadata fields** for comprehensive LoRA information
- **File storage abstraction** for local filesystem access
- **Rich querying and filtering** capabilities

### ✅ AI Recommendation System (NEW)
- **Semantic similarity search** with FAISS indexing
- **Multi-dimensional embeddings** (semantic, artistic, technical)
- **GPU acceleration** with AMD ROCm and NVIDIA CUDA support
- **Prompt-based recommendations** using natural language processing
- **Quality scoring and ranking** for intelligent LoRA discovery
- **6 recommendation endpoints** with comprehensive functionality

### ✅ SDNext Integration
- **6 generation endpoints**:
  - `/generation/backends` - List available backends
  - `/generation/generate` - Direct image generation
  - `/generation/progress/{job_id}` - Progress monitoring
  - `/generation/compose-and-generate` - LoRA + generation workflow
  - `/generation/queue-generation` - Background processing
  - `/generation/jobs/{job_id}` - Job management
- **WebSocket progress monitoring** (`/ws/progress`) with real-time updates
- **Background job processing** with Redis/RQ integration
- **Complete parameter support** for text-to-image generation


## Testing

The project maintains comprehensive test coverage with 28/28 tests passing:

- **Importer tests**: Civitai JSON parsing and metadata extraction
- **Service tests**: Unit tests for all service layer components
- **Integration tests**: Complete workflow testing
- **Worker tests**: Background job processing with fakeredis
- **API tests**: Endpoint functionality and error handling
- **Recommendation tests**: AI-powered similarity and embedding computation (13/13 tests)

Tests use isolated in-memory SQLite databases and comprehensive mocking for filesystem interactions.

## Next Steps

### High Priority
1. ✅ **Database optimization**: Added indexes for frequently queried columns (`adapter.active`, `adapter.ordinal`, `deliveryjob.status`, etc.) - Migration `952b85546fed`
2. ✅ **AI recommendation system**: Complete ML pipeline with GPU acceleration and 13/13 tests passing
3. **Timezone migration**: Add `timezone=True` to datetime columns before PostgreSQL deployment
4. **Prometheus metrics**: Add observability for API operations and importer

### Medium Priority
4. **Enhanced security**: Role-based access control beyond simple API key auth
5. **Advanced querying**: Search by trained words, filter by SD version, sort by community stats
6. **S3/MinIO storage**: Extend storage abstraction for cloud backends

### Future Features
7. **ControlNet integration**: Advanced image composition and control
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

