# LoRA Manager - Developer Guide

## Architecture Overview

This project implements a sophisticated, modern architecture with advanced dependency injection patterns, service orchestration, and component-based frontend design.

**Architecture Status**: 🟡 **Active Refactoring Initiative**  
The codebase demonstrates strong engineering foundations but is undergoing strategic architectural improvements based on comprehensive complexity analysis. Recent branches show excellent progress toward enhanced modularity and maintainability.

### Core Architectural Principles

- **Backend**: Self-contained FastAPI application with advanced service layer architecture
- **Frontend**: Vue 3 SPA with composable-based state management and component decomposition
- **Service Layer**: Dependency injection with factory patterns and specialized coordinators
- **Real-time Features**: WebSocket integration with sophisticated job queue orchestration
- **Testing**: Comprehensive coverage across Python, TypeScript, and E2E workflows

> **Current Focus**: Addressing identified complexity hotspots through service container simplification, composable extraction, and component decomposition. See [Architectural Complexity Analysis](../ARCHITECTURAL_COMPLEXITY_ANALYSIS.md) for detailed refactoring roadmap.

---

## Project Structure

```
.
├── app/              # FastAPI wrapper with Vue 3 frontend integration
│   ├── frontend/
│   │   ├── src/      # Vue SPA with advanced composables and components
│   │   │   ├── components/    # Decomposed UI components (ongoing refactoring)
│   │   │   ├── composables/   # Specialized state management utilities
│   │   │   ├── stores/        # Pinia stores for centralized state
│   │   │   └── views/         # Route-level components
│   │   ├── static/   # PWA assets, Tailwind CSS, service worker
│   │   └── utils/    # FastAPI integration helpers
│   └── main.py       # Application entrypoint with service integration
│
├── backend/          # Advanced service architecture with DI patterns
│   ├── api/v1/       # RESTful endpoints (28+ documented endpoints)
│   ├── core/         # Configuration, database, security, dependencies
│   ├── models/       # SQLModel with sophisticated relationship management
│   ├── schemas/      # Pydantic models with shared schema standardization
│   ├── services/     # Business logic with dependency injection
│   │   ├── adapters/      # LoRA adapter management
│   │   ├── analytics/     # Metrics and performance tracking
│   │   ├── archive/       # Import/export workflows
│   │   ├── generation/    # Image generation coordination
│   │   ├── recommendations/  # AI-powered similarity engine
│   │   └── providers/     # Service factory functions
│   ├── delivery/     # Pluggable backend providers (HTTP, CLI, SDNext)
│   └── workers/      # Redis/RQ background processing
│
├── tests/            # Comprehensive test architecture (ongoing reorganization)
│   ├── e2e/          # Playwright end-to-end testing
│   ├── integration/  # API and workflow integration tests
│   ├── unit/         # Focused unit tests (Python + TypeScript)
│   └── vue/          # Vue component testing with Vitest
│
├── docs/             # Complete project documentation
├── infrastructure/  # Docker deployment with GPU support
└── scripts/          # Automation and utility scripts
```

## Architectural Complexity Management

### Current Refactoring Initiative

The project is actively addressing identified complexity hotspots:

**🔴 Critical Focus Areas:**
- **ServiceContainer** (387 lines) → Decomposing into focused containers
- **GenerationHistory.vue** (713 lines) → Extracting specialized sub-components  
- **useJobQueue.ts** (378 lines) → Splitting into focused composables

**🟡 Improvement Areas:**
- Test organization (608+ line files) → Focused test modules
- Component decomposition (ongoing ImportExport refactoring)
- Service provider pattern optimization

**✅ Recent Achievements:**
- Service provider refactoring with explicit dependency injection
- ImportExport component split into specialized panels
- Shared Pydantic model standardization
- Analytics containerization with coordinator patterns

---

## Advanced Service Architecture

### Backend Service Layer (`backend/services/`)

The backend implements sophisticated dependency injection with specialized service patterns:

**Service Container Architecture:**
```python
# Current architecture (undergoing simplification)
class ServiceContainer:
    """Central DI container managing 12+ specialized services"""
    
    @property
    def adapters(self) -> AdapterService:
        """LoRA adapter CRUD with storage integration"""
    
    @property  
    def recommendations(self) -> RecommendationService:
        """AI-powered similarity engine with GPU acceleration"""
    
    @property
    def generation(self) -> GenerationCoordinator:
        """Image generation orchestration with WebSocket monitoring"""
    
    @property
    def analytics(self) -> AnalyticsService:
        """Advanced metrics tracking and performance analytics"""
    
    # ... 8+ additional specialized services
```

**Key Service Patterns:**
- **Factory Functions**: Provider pattern for clean service instantiation
- **Repository Pattern**: Specialized data access for analytics, deliveries, recommendations
- **Coordinator Pattern**: Orchestration of complex multi-service workflows
- **Background Processing**: Redis/RQ integration with comprehensive job monitoring

**Service Specializations:**
- `AdapterService`: LoRA metadata management with file validation
- `RecommendationService`: Semantic similarity with embedding coordination
- `AnalyticsService`: Metrics aggregation with time-series analysis
- `GenerationCoordinator`: Multi-backend generation with real-time updates
- `DeliveryService`: Job queue orchestration with pluggable backends
- `ArchiveService`: Import/export workflows with backup management
- `WebSocketService`: Real-time communication with job progress tracking

### Frontend Architecture (`app/frontend/src/`)

Modern Vue 3 SPA with component decomposition and sophisticated state management:

**Component Architecture:**
```vue
<!-- Current refactoring approach -->
<GenerationHistory>
  <GenerationHistoryHeader 
    @view-changed="updateView"
    @sort-changed="updateSort" />
  <GenerationHistoryFilters 
    @filter-changed="applyFilters" />
  <GenerationHistoryGrid 
    v-if="viewMode === 'grid'"
    :items="filteredItems" />
</GenerationHistory>
```

**Composable Patterns:**
```typescript
// Specialized composables for complex state management
export const useJobQueue = () => {
  const { jobs, enqueue } = useJobState()
  const { startPolling } = useJobPolling()
  const { connect } = useJobWebSocket()
  const { lastError } = useJobErrorHandling()
  
  return { jobs, enqueue, startPolling, connect, lastError }
}
```

**State Management with Pinia:**
- `useGenerationQueueStore`: Job queue state with WebSocket integration
- `useGenerationResultsStore`: Result persistence and history management
- `useNotificationStore`: User notifications and error handling
- `useSystemStatusStore`: Health monitoring and metrics tracking

---

## Development Workflow

### Prerequisites

- Python 3.10+
- Node.js 18+ 
- Docker and Docker Compose (for infrastructure)
- Redis (for background job processing)
- GPU drivers (optional, for AI recommendations)

### Quick Development Setup

**Recommended: Two-Terminal Workflow**

**Terminal 1: Backend Development**
```bash
# Install dependencies with optional ML support
pip install -r requirements.txt  # or requirements-amd.txt for GPU

# Start backend with auto-reload
uvicorn app.main:app --reload --port 8000
```

**Terminal 2: Frontend Development**
```bash
# Install dependencies (with Puppeteer skip for network restrictions)
PUPPETEER_SKIP_DOWNLOAD=true npm install

# Start Vite dev server with HMR
npm run dev
```

**Alternative: Unified Development**
```bash
# Run both backend and frontend simultaneously
npm run dev:full

# Backend only (serves built frontend)
npm run build && npm run dev:backend

# CSS development with Tailwind watch
npm run dev:css
```

### Service Development Patterns

**Adding New Services:**
```python
# 1. Create service class
class NewService:
    def __init__(self, dependency: SomeDependency):
        self._dependency = dependency

# 2. Add provider function
def make_new_service(dependency: SomeDependency) -> NewService:
    return NewService(dependency)

# 3. Register in ServiceContainer
class ServiceContainer:
    @property
    def new_service(self) -> NewService:
        if self._new_service is None:
            self._new_service = make_new_service(self.dependency)
        return self._new_service
```

**Component Development:**
```typescript
// 1. Create focused component
<script setup lang="ts">
interface Props {
  data: DataType
}

const emit = defineEmits<{
  action: [payload: ActionPayload]
}>()
</script>

// 2. Add to parent component
<NewComponent 
  :data="componentData"
  @action="handleAction" />

// 3. Test with Vitest
describe('NewComponent', () => {
  it('should handle user interactions', () => {
    // Component-focused testing
  })
})
```

---

## Comprehensive Testing Strategy

The project implements sophisticated testing across multiple layers and technologies:

### Backend Testing (Python/Pytest)

**Test Organization:**
```bash
tests/
├── unit/python/          # Focused unit tests (<200 lines each)
├── integration/          # API and workflow integration tests  
├── test_recommendations.py  # Comprehensive recommendation testing (608 lines - being refactored)
├── test_services.py      # Core service testing (518 lines)
└── test_main.py          # Application integration tests (451 lines)
```

**Running Backend Tests:**
```bash
# Focused test suites (recommended for development)
pytest tests/test_services.py -v         # Core services
pytest tests/test_main.py -v            # API integration
pytest tests/test_recommendations.py -v  # ML/AI features (requires GPU setup)

# Full test suite (requires Redis, SDNext, GPU dependencies)
pytest -v

# Coverage reporting
pytest --cov=backend --cov-report=html
```

### Frontend Testing (TypeScript/Vitest)

**Test Organization:**
```bash
tests/
├── vue/                  # Vue component tests with mounting
├── unit/                 # Pure logic and utility testing
├── integration/          # API integration testing
└── e2e/                  # Playwright browser testing
```

**Running Frontend Tests:**
```bash
# Unit tests with Vitest (fast, recommended for development)
npm run test:unit

# Component tests with Vue Test Utils
npm run test:vue

# Integration tests (require backend running)
npm run test:integration

# End-to-end tests (require Playwright setup)
npm run test:e2e

# Performance testing with Lighthouse
npm run test:performance
```

### Quality Assurance

**Code Quality Tools:**
```bash
# Python quality
ruff check .              # Fast linting
ruff format .             # Code formatting
pytest --cov             # Coverage reporting

# JavaScript/TypeScript quality  
npm run lint              # ESLint analysis
npm run lint:fix          # Auto-fix issues
npm run type-check        # TypeScript validation

# Comprehensive validation
npm run validate          # Runs linting + tests
```

**Quality Standards:**
- **Test Coverage**: >85% across backend and frontend
- **Type Safety**: Full TypeScript and Python type hints
- **Linting**: Zero linting errors in production builds
- **Performance**: Lighthouse scores >90 for PWA metrics

### Testing Complex Components

**Service Testing Patterns:**
```python
# Service container testing with mocked dependencies
@pytest.fixture
def service_container(mock_db_session):
    return ServiceContainer(
        db_session=mock_db_session,
        recommendation_gpu_available=False  # CPU testing
    )

def test_service_coordination(service_container):
    # Test service interactions without external dependencies
    result = service_container.generation.create_job(params)
    assert result.status == "queued"
```

**Vue Component Testing:**
```typescript
// Component testing with realistic props and state
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'

describe('GenerationHistory', () => {
  it('should handle filtering and pagination', async () => {
    const wrapper = mount(GenerationHistory, {
      global: {
        plugins: [createTestingPinia()]
      },
      props: { items: mockHistoryItems }
    })
    
    await wrapper.find('[data-test="filter-input"]').setValue('test')
    expect(wrapper.findAll('[data-test="history-item"]')).toHaveLength(2)
  })
})
```

---

---

## Practical Development Examples

### Service Development Workflow

**Creating a New Service:**
```python
# 1. Define service interface
class MetricsCollector:
    def __init__(self, repository: MetricsRepository):
        self._repository = repository
    
    async def collect_system_metrics(self) -> SystemMetrics:
        # Implementation focused on single responsibility
        return await self._repository.gather_metrics()

# 2. Add provider function
def make_metrics_collector(
    repository: MetricsRepository
) -> MetricsCollector:
    return MetricsCollector(repository)

# 3. Register in container (following current patterns)
class ServiceContainer:
    @property
    def metrics_collector(self) -> MetricsCollector:
        if self._metrics_collector is None:
            self._metrics_collector = make_metrics_collector(
                self.metrics_repository
            )
        return self._metrics_collector
```

### Configuration & Environment Management

**Environment Configuration:**
```bash
# Development environment
DATABASE_URL=sqlite:///./lora_manager.db
REDIS_URL=redis://localhost:6379
ENVIRONMENT=development
LOG_LEVEL=DEBUG

# Production environment  
DATABASE_URL=postgresql://user:pass@db:5432/lora_manager
REDIS_URL=redis://redis:6379
ENVIRONMENT=production
LOG_LEVEL=INFO
ENABLE_GPU_ACCELERATION=true
```

**Database Migrations:**
```bash
# Create new migration
PYTHONPATH=$(pwd) alembic -c infrastructure/alembic/alembic.ini revision --autogenerate -m "Add metrics table"

# Apply migrations
PYTHONPATH=$(pwd) alembic -c infrastructure/alembic/alembic.ini upgrade head
```

---

## Next Steps & Roadmap

### Immediate Priorities (Current Sprint)

1. **Complete ServiceContainer Refactoring** - Implement builder pattern and split into focused containers
2. **Finalize Component Decomposition** - Complete GenerationHistory and useJobQueue extraction
3. **Test Organization** - Split large test files into focused modules

For detailed architectural analysis and refactoring strategies, see [Architectural Complexity Analysis](../ARCHITECTURAL_COMPLEXITY_ANALYSIS.md).

---
