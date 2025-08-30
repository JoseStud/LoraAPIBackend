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

## Directory Structure (Refactored)

```
lora-backend/
├── app/                           # Core application code
│   ├── core/                      # Core application logic
│   │   ├── config.py              # Configuration management
│   │   ├── database.py            # Database setup and session
│   │   ├── dependencies.py        # FastAPI dependencies
│   │   ├── security.py            # Authentication/authorization
│   │   └── logging.py             # Logging configuration
│   ├── models/                    # Database models
│   │   ├── adapters.py            # Adapter model
│   │   ├── deliveries.py          # DeliveryJob model
│   │   └── base.py                # Base model classes
│   ├── schemas/                   # Pydantic schemas
│   │   ├── adapters.py            # Adapter schemas
│   │   ├── deliveries.py          # Delivery schemas
│   │   ├── generation.py          # SDNext generation schemas
│   │   └── common.py              # Common schemas
│   ├── api/v1/                    # API endpoints
│   │   ├── adapters.py            # Adapter endpoints
│   │   ├── compose.py             # Composition endpoints
│   │   ├── deliveries.py          # Delivery endpoints
│   │   ├── generation.py          # Generation endpoints
│   │   └── websocket.py           # WebSocket endpoints
│   ├── services/                  # Business logic layer
│   │   ├── adapters.py            # Adapter business logic
│   │   ├── composition.py         # Prompt composition logic
│   │   ├── deliveries.py          # Delivery orchestration
│   │   ├── generation.py          # Generation service
│   │   ├── storage.py             # File storage abstraction
│   │   └── websocket.py           # WebSocket service
│   ├── delivery/                  # Delivery backend plugins
│   │   ├── base.py                # Abstract interfaces
│   │   ├── http.py                # HTTP delivery backend
│   │   ├── cli.py                 # CLI delivery backend
│   │   └── sdnext.py              # SDNext backend
│   ├── workers/                   # Background task workers
│   │   ├── tasks.py               # Task definitions
│   │   └── worker.py              # Worker process
│   └── main.py                    # FastAPI app factory
├── scripts/                       # Operational scripts
│   ├── importer.py                # Data import utility
│   └── check_health.sh            # Health check script
├── infrastructure/                # Infrastructure and deployment
│   ├── docker/                    # Docker configurations
│   ├── alembic/                   # Database migrations
│   └── scripts/                   # Setup scripts
├── docs/                          # Documentation
└── tests/                         # Test suite
```

## Key Modules

### Core Application (`app/core/`)
- `config.py` - Application configuration management
- `database.py` - Database engine and session management
- `dependencies.py` - FastAPI dependency injection
- `security.py` - API key authentication
- `logging.py` - Structured logging setup

### Models (`app/models/`)
- `adapters.py` - LoRA adapter database model
- `deliveries.py` - Delivery job database model
- `base.py` - Base model classes

### Schemas (`app/schemas/`)
- `adapters.py` - Adapter request/response schemas
- `deliveries.py` - Delivery request/response schemas  
- `generation.py` - SDNext generation schemas
- `common.py` - Common schema classes

### Services (`app/services/`)
- `adapters.py` - LoRA metadata management
- `deliveries.py` - Job orchestration
- `composition.py` - LoRA token formatting
- `generation.py` - SDNext API integration
- `storage.py` - File storage abstraction
- `websocket.py` - Real-time progress monitoring

### Delivery Backends (`app/delivery/`)
- `base.py` - Abstract interfaces
- `http.py`, `cli.py`, `sdnext.py` - Implementation backends

### API Endpoints (`app/api/v1/`)
- `adapters.py` - LoRA management endpoints
- `compose.py` - Prompt composition
- `deliveries.py` - Job management
- `generation.py` - Image generation (6 endpoints)
- `websocket.py` - Real-time progress updates

### Workers (`app/workers/`)
- `tasks.py` - Background worker processing
- `worker.py` - Worker process runner

### Scripts (`scripts/`)
- `importer.py` - Automated Civitai metadata ingestion with smart resync

### Infrastructure (`infrastructure/`)
- `docker/` - All Docker and docker-compose files
- `alembic/` - Database migration files
- `scripts/` - Setup and deployment scripts


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
- **Comprehensive test coverage** (15/15 tests passing)
- **Database migrations** with Alembic
- **API contract hardening** with explicit response models
- **Structured logging** with optional API key authentication

### ✅ LoRA Management
- **Automated importer** with smart resync capabilities
- **25+ Civitai metadata fields** for comprehensive LoRA information
- **File storage abstraction** for local filesystem access
- **Rich querying and filtering** capabilities

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

The project maintains comprehensive test coverage with 15/15 tests passing:

- **Importer tests**: Civitai JSON parsing and metadata extraction
- **Service tests**: Unit tests for all service layer components
- **Integration tests**: Complete workflow testing
- **Worker tests**: Background job processing with fakeredis
- **API tests**: Endpoint functionality and error handling

Tests use isolated in-memory SQLite databases and comprehensive mocking for filesystem interactions.

## Next Steps

### High Priority
1. **Database optimization**: Add indexes for frequently queried columns (`adapter.active`, `deliveryjob.status`, etc.)
2. **Timezone migration**: Add `timezone=True` to datetime columns before PostgreSQL deployment
3. **Prometheus metrics**: Add observability for API operations and importer

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
python importer.py --path /data/loras

# Full re-ingestion
python importer.py --path /data/loras --force-resync

# Preview changes
python importer.py --path /data/loras --dry-run
```

### Database Migrations
```bash
# Apply all migrations
PYTHONPATH=$(pwd) alembic upgrade head

# For PostgreSQL
DATABASE_URL=postgresql://user:pass@host/db alembic upgrade head
```

